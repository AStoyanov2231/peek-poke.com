import Mapbox, { type MapState } from "@rnmapbox/maps";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import MapPinOff from "lucide-react-native/icons/map-pin-off";
import UserCheck from "lucide-react-native/icons/user-check";
import UserPlus from "lucide-react-native/icons/user-plus";
import Supercluster from "supercluster";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type ListRenderItem,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  InterestTag,
  NearbyUser,
  ProfileInterest,
  SearchTagResult,
  SearchUserResult,
} from "@peekpoke/shared";
import { parseQuery, safeQueryRetryDelay, shouldRetrySafeQuery } from "@peekpoke/shared";
import { colors, fontFamilies, radii, shadows, spacing, typography } from "@peekpoke/design";
import {
  Avatar,
  Badge,
  IconButton,
  IconGlyph,
  PremiumBadge,
  Skeleton,
} from "@/components/ui";
import { displayName } from "@/components/ui-helpers";
import { MapMarkerButton } from "@/components/map-marker-button";
import { MapFilterMenu } from "@/components/map-filter-menu";
import { LocationSyncRecovery } from "@/components/location-sync-recovery";
import { mapTouchTargetGeometry, type NativeTouchPlatform } from "@/components/ui-touch-targets";
import {
  filterNearbyUsers,
  mapFilterControlAccessibility,
  nearbyCardIsOnline,
  visibleSelectedClusterUsers,
  visibleHighlightedUser,
  type MapFilter,
} from "@/features/map/filters";
import { NoCoinsDialog, UpgradeDialog } from "@/components/friend-action-dialogs";
import { fetchCoins, fetchCurrentProfile } from "@/data/api";
import { nativeQueryClient } from "@/data/query-client";
import { nativeQueryKeys } from "@/data/query-keys";
import {
  updateLocation,
  type Bot,
  type PublicProfileData,
} from "@/data/discovery/api";
import { collectAndApplyNativeBot } from "@/data/discovery/bot-collection";
import {
  createLocationSyncCoordinator,
  locationFailureRequiresRecovery,
  locationIsFreshForDiscovery,
  refetchNearbyAfterLocationSync,
  runLocationSyncAttempt,
  type LocationSyncPhase,
} from "@/data/discovery/location-sync";
import {
  setDiscoveryFocused,
  useDiscoveryActivity,
} from "@/data/discovery/lifecycle";
import {
  DISCOVERY_REFRESH_INTERVAL_MS,
  isAbortError,
  shouldRunDiscovery,
} from "@/data/discovery/policy";
import {
  botsQueryOptions,
  nearbyQueryOptions,
  publicProfileQueryOptions,
  resolvedTagsQueryOptions,
  tagSuggestionsQueryOptions,
  userSearchQueryOptions,
} from "@/data/discovery/queries";
import { socialQuery } from "@/data/social/queries";
import { commitFriendshipBalance } from "@/data/social/cache";
import {
  createOrFindThread,
  sendFriendRequest as createFriendRequest,
  type SocialData,
} from "@/data/social/api";
import { isFriendLimitError } from "@/lib/api";
import { env } from "@/lib/env";
import { formatDistanceKm, haversineKm } from "@/lib/format";
import {
  clusterMarkerAccessibility,
  coinMarkerAccessibility,
  userMarkerAccessibility,
} from "@/lib/map-marker-accessibility";
import {
  markDeviceLocationStale,
  markDeviceLocationSynced,
  refreshDeviceLocation,
  resetDeviceLocation,
  useDeviceLocation,
} from "@/lib/location";

Mapbox.setAccessToken(env.mapboxToken);

const mapTouchGeometry = mapTouchTargetGeometry(Platform.OS as NativeTouchPlatform);
const minimumActivationSize = mapTouchGeometry.activationSize;

const DEFAULT_ZOOM = 17;
const DEFAULT_PITCH = 50;
const MAP_STYLE = "mapbox://styles/mapbox/standard";
const MAX_VISIBLE = 10;
const BOT_COLLECT_RANGE_KM = 0.05;
const EMPTY_NEARBY_USERS: NearbyUser[] = [];

type UserPointProperties = { userId: string };
type Viewport = { bbox: [number, number, number, number]; zoom: number };
type MapMarkerAction =
  | { key: string; kind: "cluster"; clusterId: number; count: number }
  | { key: string; kind: "user"; userId: string; name: string }
  | { key: string; kind: "coin"; bot: Bot; collectable: boolean };

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeout);
  }, [delay, value]);
  return debouncedValue;
}

// This route coordinates map state, queries, and navigation for the screen.
// react-doctor-disable-next-line no-giant-component
export default function MapScreen() {
  const queryClient = useQueryClient();
  // Cache invalidation happens in runLocationSync only after the acknowledgement
  // is validated and the account-bound attempt is still current.
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  const locationMutation = useMutation({
    mutationFn: ({ coords, signal }: {
      coords: { lat: number; lng: number };
      signal?: AbortSignal;
    }) => updateLocation(coords, signal),
    retry: shouldRetrySafeQuery,
    retryDelay: safeQueryRetryDelay,
  });
  const mutateLocation = locationMutation.mutateAsync;
  const [locationSyncCoordinator] = useState(() => createLocationSyncCoordinator());
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cameraRef = useRef<ComponentRef<typeof Mapbox.Camera>>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbitStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbitStepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const headingRef = useRef(0);

  const profileQuery = useQuery({
    queryKey: nativeQueryKeys.profile.current,
    queryFn: fetchCurrentProfile,
  });
  const socialDataQuery = useQuery(socialQuery());
  const coinsQuery = useQuery({
    queryKey: nativeQueryKeys.coins,
    queryFn: fetchCoins,
  });
  const profile = profileQuery.data;
  const locationAccountScope = useMemo(
    () => ({ userId: profile?.id ?? null }),
    [profile?.id],
  );
  const socialData = socialDataQuery.data;
  const friends = useMemo(
    () => socialData?.friends.flatMap((friend) => {
      const peer = friend.requester_id === profile?.id ? friend.addressee : friend.requester;
      return peer ? [peer] : [];
    }) ?? [],
    [profile?.id, socialData?.friends],
  );
  const requests = useMemo(
    () => socialData?.requests ?? [],
    [socialData?.requests],
  );
  const sentRequestUserIds = useMemo(
    () => socialData?.sentRequestUserIds ?? [],
    [socialData?.sentRequestUserIds],
  );
  const coins = coinsQuery.data?.balance ?? 0;
  const setCoins = useCallback((balance: number) => {
    commitFriendshipBalance(queryClient, balance);
  }, [queryClient]);
  const sentRequestIds = useMemo(() => new Set(sentRequestUserIds), [sentRequestUserIds]);
  const activity = useDiscoveryActivity();
  const deviceLocation = useDeviceLocation();
  const {
    coords: location,
    status: locationStatus,
    error: locationError,
  } = deviceLocation;
  const locationFresh = locationIsFreshForDiscovery(deviceLocation, profile?.id);
  const discoveryActive = shouldRunDiscovery(
    activity.focused,
    activity.appState,
    !!profile?.id,
  );

  const [queryText, setQueryText] = useState("");
  const [mapFilter, setMapFilter] = useState<MapFilter>("all");
  const [mapFilterOpen, setMapFilterOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [highlightedUserId, setHighlightedUserId] = useState<string | null>(null);
  const [highlightedData, setHighlightedData] = useState<PublicProfileData | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedClusterUserIds, setSelectedClusterUserIds] = useState<string[] | null>(null);
  const [friendLoadingId, setFriendLoadingId] = useState<string | null>(null);
  const [noCoinsOpen, setNoCoinsOpen] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [locationSyncFailure, setLocationSyncFailure] = useState<{
    accountScope: typeof locationAccountScope;
    error: unknown;
    phase: LocationSyncPhase;
  } | null>(null);
  const [locationSyncPendingScope, setLocationSyncPendingScope] = useState<
    typeof locationAccountScope | null
  >(null);
  const [markerActionsOpen, setMarkerActionsOpen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({
    bbox: [-180, -85, 180, 85],
    zoom: DEFAULT_ZOOM,
  });

  const debouncedQueryText = useDebouncedValue(queryText, 200);
  const parsedQuery = useMemo(() => parseQuery(queryText, cursorPos), [cursorPos, queryText]);
  const debouncedParsedQuery = useMemo(
    () => parseQuery(debouncedQueryText, debouncedQueryText.length),
    [debouncedQueryText]
  );
  const isTagMode = parsedQuery.activeTagPrefix !== null;
  const uniqueRawTagTokens = useMemo(
    () => [...new Set(debouncedParsedQuery.rawTagTokens)].sort(),
    [debouncedParsedQuery.rawTagTokens]
  );

  const tagSuggestionsQuery = useQuery({
    ...tagSuggestionsQueryOptions(parsedQuery.activeTagPrefix ?? ""),
    enabled: discoveryActive && isTagMode,
  });

  const resolvedTagsQuery = useQuery({
    ...resolvedTagsQueryOptions(uniqueRawTagTokens),
    enabled: discoveryActive && uniqueRawTagTokens.length > 0,
  });

  const resolvedTagIds = useMemo(
    () => (resolvedTagsQuery.data ?? []).map((tag) => tag.id),
    [resolvedTagsQuery.data]
  );
  const nearbyQuery = useQuery({
    ...nearbyQueryOptions(location ?? { lat: 0, lng: 0 }, profile?.id ?? ""),
    enabled: discoveryActive && !!location && locationFresh,
  });
  const nearbyUsers = locationFresh ? (nearbyQuery.data ?? EMPTY_NEARBY_USERS) : EMPTY_NEARBY_USERS;
  const nearbyIds = useMemo(() => nearbyUsers.map((user) => user.userId), [nearbyUsers]);
  const userSearchEnabled = debouncedParsedQuery.nameQuery !== "" || resolvedTagIds.length > 0;

  const userSearchQuery = useQuery({
    ...userSearchQueryOptions(
      debouncedParsedQuery.nameQuery,
      resolvedTagIds,
      [...nearbyIds].sort(),
    ),
    enabled: discoveryActive && userSearchEnabled,
  });

  const searchNearby = useMemo(
    () => (userSearchQuery.data ?? []).filter((user) => user.is_nearby),
    [userSearchQuery.data]
  );
  const searchOthers = useMemo(
    () => (userSearchQuery.data ?? []).filter((user) => !user.is_nearby),
    [userSearchQuery.data]
  );

  const botsQuery = useQuery({
    ...botsQueryOptions(location ?? { lat: 0, lng: 0 }, profile?.id ?? ""),
    enabled: discoveryActive && !!location && locationFresh,
  });

  const [collectedBotIds, setCollectedBotIds] = useState<Set<string>>(() => new Set());
  const bots = useMemo(
    () => locationFresh
      ? (botsQuery.data ?? []).filter((bot) => !collectedBotIds.has(bot.id))
      : [],
    [botsQuery.data, collectedBotIds, locationFresh]
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(""), 2000);
  }, []);

  const runLocationSync = useCallback((
    accountScope: typeof locationAccountScope,
    resolveCoordinates: (signal: AbortSignal) => Promise<{ lat: number; lng: number }>,
  ) => {
    if (!accountScope.userId) return Promise.resolve("superseded" as const);
    const userId = accountScope.userId;
    return runLocationSyncAttempt({
      coordinator: locationSyncCoordinator,
      userId,
      resolveCoordinates,
      sync: (coords, signal) => mutateLocation({ coords, signal }),
      onFailure: (error, phase) => {
        if (locationFailureRequiresRecovery(phase, Boolean(location))) {
          markDeviceLocationStale(
            userId,
            error instanceof Error ? error.message : "Could not refresh your location",
          );
          setLocationSyncFailure({ accountScope, error, phase });
        }
        else if (!isAbortError(error)) {
          showNotice(error instanceof Error ? error.message : "Could not refresh your location");
        }
      },
      onPending: (pending) => {
        setLocationSyncPendingScope((current) => pending
          ? accountScope
          : current === accountScope ? null : current);
      },
      onSuccess: (coords) => {
        if (!markDeviceLocationSynced(userId, coords)) return;
        setLocationSyncFailure((current) => current?.accountScope === accountScope ? null : current);
        void refetchNearbyAfterLocationSync(queryClient, userId);
      },
    });
  }, [location, locationSyncCoordinator, mutateLocation, queryClient, showNotice]);

  const refreshAndSyncLocation = useCallback(() => {
    return runLocationSync(locationAccountScope, refreshDeviceLocation);
  }, [locationAccountScope, runLocationSync]);

  const retryLocationSync = useCallback(() => {
    const hasLocalFailure = locationSyncFailure?.accountScope === locationAccountScope;
    const hasDeviceFailure = Boolean(
      locationAccountScope.userId &&
      deviceLocation.failureForUserId === locationAccountScope.userId &&
      deviceLocation.error,
    );
    if (!hasLocalFailure && !hasDeviceFailure) return;
    void refreshAndSyncLocation();
  }, [deviceLocation.error, deviceLocation.failureForUserId, locationAccountScope, locationSyncFailure, refreshAndSyncLocation]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) {
      resetDeviceLocation();
      void nativeQueryClient.cancelQueries({ queryKey: ["discovery"] });
    }
    return () => locationSyncCoordinator.cancel();
  }, [locationSyncCoordinator, profile?.id]);

  useEffect(() => {
    if (!discoveryActive) {
      void nativeQueryClient.cancelQueries({ queryKey: ["discovery"] });
    }
  }, [discoveryActive]);

  useEffect(() => {
    if (!locationFresh && profile?.id) {
      void queryClient.cancelQueries({
        queryKey: ["discovery", "nearby", profile.id],
      });
    }
  }, [locationFresh, profile?.id, queryClient]);

  useEffect(() => {
    if (!discoveryActive) return;

    const refresh = () => {
      void refreshAndSyncLocation();
    };

    refresh();
    const interval = setInterval(refresh, DISCOVERY_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      locationSyncCoordinator.cancel();
    };
  }, [discoveryActive, locationSyncCoordinator, refreshAndSyncLocation]);

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);
  const filteredUsers = useMemo(
    () => filterNearbyUsers(nearbyUsers, mapFilter, friendIds, queryText),
    [friendIds, mapFilter, nearbyUsers, queryText],
  );
  const usersById = useMemo(
    () => new Map(nearbyUsers.map((user) => [user.userId, user])),
    [nearbyUsers]
  );
  const incomingIds = useMemo(
    () => new Set(requests.map((request) => request.requester_id)),
    [requests]
  );

  const highlightedUser = visibleHighlightedUser(filteredUsers, highlightedUserId);

  const clusterIndex = useMemo(() => {
    const index = new Supercluster<UserPointProperties>({ radius: 40, maxZoom: 20 });
    const points: Supercluster.PointFeature<UserPointProperties>[] = [];
    for (const user of filteredUsers) {
      if (user.userId === highlightedUserId) continue;
      points.push({
        type: "Feature" as const,
        properties: { userId: user.userId },
        geometry: {
          type: "Point" as const,
          coordinates: [user.lng, user.lat],
        },
      });
    }
    index.load(points);
    return index;
  }, [filteredUsers, highlightedUserId]);

  const clusters = useMemo(
    () => clusterIndex.getClusters(viewport.bbox, Math.round(viewport.zoom)),
    [clusterIndex, viewport]
  );

  const markerActions = useMemo(() => {
    const actions: MapMarkerAction[] = [];
    for (const cluster of clusters) {
      if ("cluster" in cluster.properties && cluster.properties.cluster) {
        actions.push({
          key: `cluster-${cluster.properties.cluster_id}`,
          kind: "cluster",
          clusterId: cluster.properties.cluster_id,
          count: cluster.properties.point_count,
        });
        continue;
      }

      const user = usersById.get(cluster.properties.userId);
      if (user) {
        actions.push({
          key: `user-${user.userId}`,
          kind: "user",
          userId: user.userId,
          name: displayName(user),
        });
      }
    }

    if (highlightedUser && !actions.some((action) => action.kind === "user" && action.userId === highlightedUser.userId)) {
      actions.unshift({
        key: `user-${highlightedUser.userId}`,
        kind: "user",
        userId: highlightedUser.userId,
        name: displayName(highlightedUser),
      });
    }

    for (const bot of bots) {
      actions.push({
        key: `coin-${bot.id}`,
        kind: "coin",
        bot,
        collectable: location
          ? haversineKm(location.lat, location.lng, bot.lat, bot.lng) <= BOT_COLLECT_RANGE_KM
          : false,
      });
    }
    return actions;
  }, [bots, clusters, highlightedUser, location, usersById]);

  const selectCluster = useCallback((clusterId: number) => {
    setSelectedClusterId(clusterId);
    setSelectedClusterUserIds(
      clusterIndex.getLeaves(clusterId, Infinity).map((leaf) => leaf.properties.userId)
    );
  }, [clusterIndex]);

  const displayedUsers = useMemo(
    () => visibleSelectedClusterUsers(filteredUsers, selectedClusterUserIds),
    [filteredUsers, selectedClusterUserIds],
  );

  const visibleSlice = displayedUsers.slice(0, MAX_VISIBLE);
  const hasCards = visibleSlice.length > 0;
  const friendsOnline = friends.filter((friend) => friend.is_online).length;
  const cardWidth = Math.max(280, width - spacing[8]);

  const stopOrbit = useCallback(() => {
    if (orbitStartTimerRef.current) clearTimeout(orbitStartTimerRef.current);
    if (orbitStepTimerRef.current) clearInterval(orbitStepTimerRef.current);
    orbitStartTimerRef.current = null;
    orbitStepTimerRef.current = null;
  }, []);

  const startOrbit = useCallback(() => {
    stopOrbit();
    orbitStartTimerRef.current = setTimeout(() => {
      const step = () => {
        const nextHeading = headingRef.current + 6;
        cameraRef.current?.setCamera({
          heading: nextHeading,
          animationDuration: 1000,
          animationMode: "linearTo",
        });
        headingRef.current = nextHeading % 360;
      };
      step();
      orbitStepTimerRef.current = setInterval(step, 1000);
    }, 700);
  }, [stopOrbit]);

  useEffect(() => stopOrbit, [stopOrbit]);

  const clearSelection = useCallback(() => {
    stopOrbit();
    setSelectedClusterId(null);
    setSelectedClusterUserIds(null);
    setHighlightedUserId(null);
    setHighlightedData(null);
    setPendingUserId(null);
  }, [stopOrbit]);

  useFocusEffect(
    useCallback(() => {
      setDiscoveryFocused(true);
      return () => {
        setDiscoveryFocused(false);
        clearSelection();
        void nativeQueryClient.cancelQueries({ queryKey: ["discovery"] });
      };
    }, [clearSelection])
  );

  const selectUser = useCallback(
    async (userId: string) => {
      if (pendingUserId === userId || highlightedUserId === userId) return;
      const user = usersById.get(userId);
      if (!user) return;

      setPendingUserId(userId);
      setHighlightedData(null);
      setSelectedClusterId(null);
      setSelectedClusterUserIds(null);
      try {
        const data = await nativeQueryClient.fetchQuery(publicProfileQueryOptions(userId));
        setHighlightedData(data);
      } catch {
        setHighlightedData(null);
      } finally {
        setHighlightedUserId(userId);
        setPendingUserId(null);
        cameraRef.current?.setCamera({
          centerCoordinate: [user.lng, user.lat],
          zoomLevel: DEFAULT_ZOOM,
          pitch: DEFAULT_PITCH,
          padding: { paddingTop: 0, paddingRight: 0, paddingBottom: 300, paddingLeft: 0 },
          animationDuration: 700,
          animationMode: "easeTo",
        });
        startOrbit();
      }
    },
    [highlightedUserId, pendingUserId, startOrbit, usersById]
  );

  const sendFriendRequest = useCallback(async (userId: string, event?: GestureResponderEvent) => {
    event?.stopPropagation();
    if (friendLoadingId || sentRequestIds.has(userId)) return;
    if (coins < 1) {
      setNoCoinsOpen(true);
      return;
    }

    setFriendLoadingId(userId);
    try {
      await createFriendRequest(userId, (response) => {
        setCoins(response.balance);
        queryClient.setQueryData<SocialData>(nativeQueryKeys.social.friends, (current) => current
          ? {
              ...current,
              sentRequestUserIds: current.sentRequestUserIds.includes(userId)
                ? current.sentRequestUserIds
                : [...current.sentRequestUserIds, userId],
            }
          : current);
        void queryClient.invalidateQueries({ queryKey: nativeQueryKeys.social.friends });
      });
    } catch (error) {
      if (isFriendLimitError(error)) setUpgradeMessage(error.message);
      else showNotice(error instanceof Error ? error.message : "Could not send friend request");
    } finally {
      setFriendLoadingId(null);
    }
  }, [coins, friendLoadingId, queryClient, sentRequestIds, setCoins, showNotice]);

  async function openChat(userId: string) {
    try {
      const thread = await createOrFindThread(userId);
      setCoins(thread.balance);
      clearSelection();
      router.push({ pathname: "/chat/[threadId]", params: { threadId: thread.id } } as never);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not start chat");
    }
  }

  async function collectBot(bot: Bot) {
    if (!location || !locationFresh) return;
    const collectable = haversineKm(location.lat, location.lng, bot.lat, bot.lng) <= BOT_COLLECT_RANGE_KM;
    if (!collectable) {
      showNotice("Get closer");
      return;
    }

    try {
      await collectAndApplyNativeBot(bot.id, location, {
        setBalance: setCoins,
        markCollected: (botId) => {
          setCollectedBotIds((current) => new Set(current).add(botId));
        },
        refetchBots: () => void botsQuery.refetch(),
      });
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not collect coin");
    }
  }

  function handleMapIdle(state: MapState) {
    if (typeof state.properties.heading === "number") {
      headingRef.current = state.properties.heading;
    }
    const { ne, sw } = state.properties.bounds;
    setViewport({
      bbox: [sw[0], sw[1], ne[0], ne[1]],
      zoom: state.properties.zoom,
    });
  }

  const renderNearbyCard = useCallback(({ item: user }: { item: NearbyUser }) => (
    <NearbyCardItem
      cardWidth={cardWidth}
      distance={formatDistanceKm(location, { lat: user.lat, lng: user.lng })}
      hideAdd={friendIds.has(user.userId) || incomingIds.has(user.userId) || user.userId === profile?.id}
      isOnline={nearbyCardIsOnline(user)}
      loading={friendLoadingId === user.userId}
      onAddFriend={sendFriendRequest}
      onSelect={selectUser}
      pending={pendingUserId === user.userId}
      selected={highlightedUser?.userId === user.userId}
      sent={sentRequestIds.has(user.userId)}
      user={user}
    />
  ), [cardWidth, friendIds, friendLoadingId, highlightedUser?.userId, incomingIds, location, pendingUserId, profile?.id, selectUser, sentRequestIds, sendFriendRequest]);

  const activeLocationSyncFailure = locationSyncFailure?.accountScope === locationAccountScope
    ? locationSyncFailure
    : locationAccountScope.userId &&
        deviceLocation.failureForUserId === locationAccountScope.userId &&
        deviceLocation.error &&
        location
      ? {
          accountScope: locationAccountScope,
          error: new Error(deviceLocation.error),
          phase: "coordinates" as const,
        }
      : null;

  if (!location) {
    return (
      <View style={styles.locationGate}>
        {locationStatus === "denied" ? (
          <>
            <MapPinOff accessible={false} color={colors.ink[5]} size={40} strokeWidth={2} />
            <Text style={styles.locationTitle}>Location is off</Text>
            <Text style={styles.locationDescription}>
              Peek &amp; Poke needs your location to show people nearby.
            </Text>
            <Text style={styles.locationHelp}>
              Allow location access in your device settings, then return to Peek &amp; Poke.
            </Text>
          </>
        ) : locationStatus === "error" ? (
          <>
            <MapPinOff accessible={false} color={colors.ink[5]} size={40} strokeWidth={2} />
            <Text style={styles.locationTitle}>Could not load your location</Text>
            <Text style={styles.locationDescription}>{locationError ?? "Please try again."}</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.locationRetry}
              onPress={() => void refreshAndSyncLocation()}
            >
              <Text style={styles.locationRetryText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.ink[5]} size="large" />
            <Text style={styles.locationDescription}>Finding you…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.mapTarget}>
        <Mapbox.MapView
          style={styles.map}
          styleURL={MAP_STYLE}
          logoEnabled
          compassEnabled={false}
          scaleBarEnabled={false}
          onPress={clearSelection}
          onMapIdle={handleMapIdle}
        >
          <Mapbox.Camera
            ref={cameraRef}
            minZoomLevel={16}
            maxZoomLevel={22}
            defaultSettings={{
              zoomLevel: DEFAULT_ZOOM,
              pitch: DEFAULT_PITCH,
              centerCoordinate: [location.lng, location.lat],
            }}
          />

          {profile ? (
            <Mapbox.PointAnnotation id="self" coordinate={[location.lng, location.lat]}>
              <View style={[styles.pinShadow, styles.selfPinShadow]}>
                <Avatar
                  name={displayName(profile)}
                  uri={profile.avatar_url}
                  size={40}
                  ringColor={colors.primary[500]}
                />
              </View>
            </Mapbox.PointAnnotation>
          ) : null}

          {clusters.map((cluster) => {
            const [lng, lat] = cluster.geometry.coordinates;
            if ("cluster" in cluster.properties && cluster.properties.cluster) {
              const clusterId = cluster.properties.cluster_id;
              const selected = selectedClusterId === clusterId;
              const count = cluster.properties.point_count;
              return (
                <MapMarkerButton
                  key={`cluster-${clusterId}`}
                  coordinate={[lng, lat]}
                  accessibilityLabel={`${count} people nearby`}
                  accessibilityState={{ selected }}
                  onPress={() => selectCluster(clusterId)}
                  style={styles.annotationTarget}
                >
                  <View style={[styles.cluster, selected && styles.clusterSelected]}>
                    <Text style={styles.clusterText}>{count > 99 ? "99+" : count}</Text>
                  </View>
                </MapMarkerButton>
              );
            }

            const userId = cluster.properties.userId;
            const user = usersById.get(userId);
            if (!user) return null;
            const pending = pendingUserId === userId;
            const friend = friendIds.has(userId);
            return (
              <MapMarkerButton
                key={userId}
                coordinate={[lng, lat]}
                accessibilityLabel={displayName(user)}
                accessibilityState={{ busy: pending }}
                disabled={pending}
                onPress={() => void selectUser(userId)}
                style={[styles.annotationTarget, pending && styles.pinPending]}
              >
                <View style={styles.pinShadow}>
                  <Avatar
                    name={displayName(user)}
                    uri={user.avatar_url}
                    size={mapTouchGeometry.pinVisualSize}
                    ringColor={friend ? colors.primary[500] : colors.surface}
                  />
                  {pending ? <ActivityIndicator style={styles.pinLoader} color={colors.primary[500]} size={18} /> : null}
                </View>
              </MapMarkerButton>
            );
          })}

          {bots.map((bot) => {
            const collectable = haversineKm(location.lat, location.lng, bot.lat, bot.lng) <= BOT_COLLECT_RANGE_KM;
            return (
              <MapMarkerButton
                key={bot.id}
                coordinate={[bot.lng, bot.lat]}
                accessibilityLabel={collectable ? "Collect coin" : "Coin - get closer"}
                onPress={() => void collectBot(bot)}
                style={styles.annotationTarget}
              >
                <View style={[styles.botPin, collectable ? styles.botCollectable : styles.botFar]}>
                  <IconGlyph
                    name="coins"
                    color={collectable ? colors.surface : colors.ink[6]}
                    size={18}
                  />
                </View>
              </MapMarkerButton>
            );
          })}

          {highlightedUser ? (
            <Mapbox.PointAnnotation
              id={`highlighted-${highlightedUser.userId}`}
              coordinate={[highlightedUser.lng, highlightedUser.lat]}
            >
              <View style={styles.highlightedPinShadow}>
                <Avatar
                  name={displayName(highlightedUser)}
                  uri={highlightedUser.avatar_url}
                  size={52}
                  ringColor={colors.primary[500]}
                />
              </View>
            </Mapbox.PointAnnotation>
          ) : null}
        </Mapbox.MapView>
      </View>

      {locationFresh && nearbyQuery.isFetching && !nearbyQuery.data ? (
        <View pointerEvents="none" style={[styles.discoveryStatus, { top: insets.top + 170 }]}>
          <ActivityIndicator color={colors.ink[6]} size="small" />
          <Text style={styles.discoveryStatusText}>Finding people nearby…</Text>
        </View>
      ) : locationFresh && nearbyQuery.isError ? (
        <Pressable
          accessibilityRole="button"
          style={[styles.discoveryStatus, { top: insets.top + 170 }]}
          onPress={() => void nearbyQuery.refetch()}
        >
          <Text style={styles.discoveryStatusText}>Could not refresh nearby people. Tap to retry.</Text>
        </Pressable>
      ) : locationFresh && nearbyQuery.isSuccess && nearbyUsers.length === 0 ? (
        <View pointerEvents="none" style={[styles.discoveryStatus, { top: insets.top + 170 }]}>
          <Text style={styles.discoveryStatusText}>No one nearby yet</Text>
        </View>
      ) : null}

      <View style={[styles.searchRow, { top: insets.top + 58 }]}>
        <View style={styles.searchColumn}>
          <View style={styles.searchPill}>
            <IconGlyph name="search" color={colors.ink[5]} size={18} />
            <TextInput
              accessibilityLabel="Search people nearby"
              style={styles.searchText}
              value={queryText}
              onChangeText={(value) => {
                setQueryText(value);
                setCursorPos(value.length);
                setSelectedClusterId(null);
                setSelectedClusterUserIds(null);
              }}
              onSelectionChange={(event) => setCursorPos(event.nativeEvent.selection.end)}
              placeholder="Search people nearby"
              placeholderTextColor={colors.ink[5]}
              autoCapitalize="none"
              autoCorrect={false}
              showSoftInputOnFocus
              returnKeyType="search"
            />
            {queryText ? (
              <IconButton
                icon="close"
                label="Clear search"
                size={28}
                variant="ghost"
                onPress={() => {
                  setQueryText("");
                  setCursorPos(0);
                }}
              />
            ) : null}
          </View>
          {queryText ? (
            <SearchDropdown
              currentUserId={profile?.id}
              error={
                tagSuggestionsQuery.isError ||
                resolvedTagsQuery.isError ||
                userSearchQuery.isError
              }
              friendIds={friendIds}
              incomingIds={incomingIds}
              isTagMode={isTagMode}
              loading={isTagMode ? tagSuggestionsQuery.isLoading : userSearchQuery.isLoading}
              nearby={searchNearby}
              others={searchOthers}
              sentRequestUserIds={sentRequestUserIds}
              tagSuggestions={tagSuggestionsQuery.data ?? []}
              userSearchEnabled={userSearchEnabled}
              friendLoadingId={friendLoadingId}
              onAddFriend={sendFriendRequest}
              onSelectTag={(tag) => {
                const beforeCursor = queryText.slice(0, cursorPos);
                const atIndex = beforeCursor.lastIndexOf("@");
                if (atIndex === -1) return;
                const afterAt = queryText.slice(atIndex);
                const spaceIndex = afterAt.indexOf(" ");
                const tokenEnd = spaceIndex === -1 ? queryText.length : atIndex + spaceIndex + 1;
                const next = `${queryText.slice(0, atIndex)}@${tag.name} ${queryText.slice(tokenEnd)}`;
                setQueryText(next);
                setCursorPos(atIndex + tag.name.length + 2);
              }}
              onSelectUser={(selectedUserId) =>
                router.push({ pathname: "/(app)/profile/[userId]", params: { userId: selectedUserId } } as never)
              }
            />
          ) : null}
        </View>
        <View style={styles.filterSurface}>
          <IconButton
            accessibilityHint={mapFilterControlAccessibility(mapFilter, mapFilterOpen).hint}
            accessibilityState={mapFilterControlAccessibility(mapFilter, mapFilterOpen).state}
            icon="filter"
            label={mapFilterControlAccessibility(mapFilter, mapFilterOpen).label}
            size={44}
            variant="ghost"
            onPress={() => setMapFilterOpen(true)}
          />
        </View>
        <View style={styles.filterSurface}>
          <IconButton
            accessibilityState={{ expanded: markerActionsOpen }}
            icon="map"
            label={`Browse map items, ${markerActions.length} available`}
            size={44}
            variant="ghost"
            onPress={() => setMarkerActionsOpen(true)}
          />
        </View>
      </View>

      <MapFilterMenu
        filter={mapFilter}
        open={mapFilterOpen}
        onChange={(filter) => {
          setMapFilter(filter);
          setSelectedClusterId(null);
          setSelectedClusterUserIds(null);
        }}
        onOpenChange={setMapFilterOpen}
      />

      <MapMarkerActionSheet
        actions={markerActions}
        bottomInset={insets.bottom}
        highlightedUserId={highlightedUser?.userId ?? null}
        open={markerActionsOpen}
        pendingUserId={pendingUserId}
        selectedClusterId={selectedClusterId}
        zoom={viewport.zoom}
        onClose={() => setMarkerActionsOpen(false)}
        onCollectCoin={(bot) => void collectBot(bot)}
        onSelectCluster={selectCluster}
        onSelectUser={(userId) => void selectUser(userId)}
      />

      <View style={[styles.topLabels, { top: insets.top + 112 }]}>
        <View style={styles.onlinePill}>
          <View style={styles.onlineDot} />
          <Text style={styles.pillText}>{friendsOnline} friends online</Text>
        </View>
        <View style={styles.coinPill}>
          <IconGlyph name="coins" color="#e8c547" size={15} />
          <Text style={styles.coinText}>{coins} / 5</Text>
          <Text style={styles.coinSubtext}>coins</Text>
        </View>
      </View>

      <IconButton
        icon="recenter"
        label="Center map on my location"
        size={44}
        style={[styles.recenter, { bottom: insets.bottom + (hasCards ? 178 : 94) }]}
        onPress={() => {
          clearSelection();
          cameraRef.current?.setCamera({
            centerCoordinate: [location.lng, location.lat],
            zoomLevel: DEFAULT_ZOOM,
            pitch: DEFAULT_PITCH,
            heading: 0,
            animationDuration: 1200,
            animationMode: "flyTo",
          });
        }}
      />

      {hasCards ? (
        <View style={[styles.nearbyRail, { bottom: insets.bottom + 94 }]}>
          <FlatList
            data={visibleSlice}
            horizontal
            decelerationRate="fast"
            snapToInterval={cardWidth + spacing[3]}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nearbyRailContent}
            keyExtractor={(item) => item.userId}
            renderItem={renderNearbyCard}
          />
        </View>
      ) : null}

      {highlightedUser && highlightedData ? (
        <HighlightedUserCard
          data={highlightedData}
          insetsBottom={insets.bottom}
          isFriend={friendIds.has(highlightedUser.userId)}
          isOnline={highlightedData.profile.is_online}
          premium={highlightedData.profile.is_premium}
          user={highlightedUser}
          onClose={clearSelection}
          onProfile={() =>
            router.push({ pathname: "/(app)/profile/[userId]", params: { userId: highlightedUser.userId } } as never)
          }
          onSayHi={() => openChat(highlightedUser.userId)}
        />
      ) : null}

      {activeLocationSyncFailure ? (
        <LocationSyncRecovery
          bottom={insets.bottom + 176}
          pending={locationSyncPendingScope === activeLocationSyncFailure.accountScope}
          onRetry={retryLocationSync}
        />
      ) : null}

      {notice ? (
        <View pointerEvents="none" style={[styles.notice, { bottom: insets.bottom + 176 }]}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      <NoCoinsDialog open={noCoinsOpen} onClose={() => setNoCoinsOpen(false)} />
      <UpgradeDialog
        message={upgradeMessage}
        onClose={() => setUpgradeMessage(null)}
        onUpgrade={() => router.navigate("/(app)/premium" as never)}
      />
    </View>
  );
}

function MapMarkerActionRow({
  action,
  highlightedUserId,
  pendingUserId,
  selectedClusterId,
  zoom,
  onSelect,
}: {
  action: MapMarkerAction;
  highlightedUserId: string | null;
  pendingUserId: string | null;
  selectedClusterId: number | null;
  zoom: number;
  onSelect: (action: MapMarkerAction) => void;
}) {
  const accessibility = action.kind === "cluster"
    ? clusterMarkerAccessibility(action.count, zoom, selectedClusterId === action.clusterId)
    : action.kind === "user"
      ? userMarkerAccessibility(
          action.name,
          highlightedUserId === action.userId,
          pendingUserId === action.userId,
        )
      : coinMarkerAccessibility(action.collectable);
  const detail = action.kind === "cluster"
    ? `Cluster · zoom ${Math.round(zoom)}`
    : action.kind === "user"
      ? "Person"
      : action.collectable ? "Coin · in range" : "Coin · get closer";
  const handlePress = useCallback(() => onSelect(action), [action, onSelect]);

  return (
    <Pressable
      accessibilityHint={accessibility.hint}
      accessibilityLabel={accessibility.label}
      accessibilityRole="button"
      accessibilityState={accessibility.state}
      disabled={accessibility.state.disabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.markerAction,
        accessibility.state.selected && styles.markerActionSelected,
        accessibility.state.disabled && styles.markerActionDisabled,
        pressed && styles.markerActionPressed,
      ]}
    >
      <IconGlyph
        name={action.kind === "cluster" ? "users" : action.kind === "user" ? "profile" : "coins"}
        color={colors.ink[7]}
        size={20}
      />
      <View style={styles.markerActionText}>
        <Text numberOfLines={1} style={styles.markerActionLabel}>{accessibility.label}</Text>
        <Text style={styles.markerActionDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function MapMarkerActionSheet({
  actions,
  bottomInset,
  highlightedUserId,
  open,
  pendingUserId,
  selectedClusterId,
  zoom,
  onClose,
  onCollectCoin,
  onSelectCluster,
  onSelectUser,
}: {
  actions: MapMarkerAction[];
  bottomInset: number;
  highlightedUserId: string | null;
  open: boolean;
  pendingUserId: string | null;
  selectedClusterId: number | null;
  zoom: number;
  onClose: () => void;
  onCollectCoin: (bot: Bot) => void;
  onSelectCluster: (clusterId: number) => void;
  onSelectUser: (userId: string) => void;
}) {
  const selectAction = useCallback((action: MapMarkerAction) => {
    if (action.kind === "coin" && !action.collectable) return;
    onClose();
    if (action.kind === "cluster") onSelectCluster(action.clusterId);
    else if (action.kind === "user") onSelectUser(action.userId);
    else onCollectCoin(action.bot);
  }, [onClose, onCollectCoin, onSelectCluster, onSelectUser]);
  const renderAction: ListRenderItem<MapMarkerAction> = useCallback(({ item }) => (
    <MapMarkerActionRow
      action={item}
      highlightedUserId={highlightedUserId}
      pendingUserId={pendingUserId}
      selectedClusterId={selectedClusterId}
      zoom={zoom}
      onSelect={selectAction}
    />
  ), [highlightedUserId, pendingUserId, selectedClusterId, selectAction, zoom]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.markerActionOverlay}>
        <Pressable accessible={false} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          accessibilityLabel="Map items"
          accessibilityViewIsModal
          style={[styles.markerActionSheet, { paddingBottom: Math.max(bottomInset, spacing[4]) }]}
        >
          <View style={styles.markerActionHeader}>
            <View style={styles.markerActionHeading}>
              <Text style={styles.markerActionTitle}>Map items</Text>
              <Text style={styles.markerActionDescription}>Choose a visible marker</Text>
            </View>
            <IconButton icon="close" label="Close map items" size={36} variant="ghost" onPress={onClose} />
          </View>
          <FlatList
            accessibilityLabel="Visible map markers"
            data={actions}
            keyExtractor={(action) => action.key}
            ListEmptyComponent={<Text style={styles.markerActionEmpty}>No interactive markers are visible.</Text>}
            renderItem={renderAction}
          />
        </View>
      </View>
    </Modal>
  );
}

function NearbyCardItem({
  cardWidth,
  distance,
  hideAdd,
  isOnline,
  loading,
  onAddFriend,
  onSelect,
  pending,
  selected,
  sent,
  user,
}: {
  cardWidth: number;
  distance: string | null;
  hideAdd: boolean;
  isOnline: boolean;
  loading: boolean;
  onAddFriend: (userId: string, event?: GestureResponderEvent) => void;
  onSelect: (userId: string) => void;
  pending: boolean;
  selected: boolean;
  sent: boolean;
  user: NearbyUser;
}) {
  const name = displayName(user);
  const handleSelect = useCallback(() => onSelect(user.userId), [onSelect, user.userId]);
  const handleAddFriend = useCallback((event: GestureResponderEvent) => onAddFriend(user.userId, event), [onAddFriend, user.userId]);

  return (
    <View style={[styles.nearbyCard, { width: cardWidth }, selected && styles.nearbyCardSelected, pending && styles.nearbyCardPending]}>
      <Pressable accessibilityRole="button" onPress={handleSelect} style={({ pressed }) => [styles.cardMain, pressed && styles.nearbyCardPressed]}>
        <Avatar name={name} uri={user.avatar_url} size={48} online={isOnline} />
        <View style={styles.nearbyInfo}>
          <Text numberOfLines={1} style={styles.nearbyName}>{name}</Text>
          <Text numberOfLines={1} style={styles.nearbyMeta}>
            {distance ? `${distance} · ` : ""}{isOnline ? "Online" : "Offline"}
          </Text>
        </View>
      </Pressable>
      {!hideAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || sent }}
          disabled={loading || sent}
          onPress={handleAddFriend}
          style={({ pressed }) => [styles.compactButtonTarget, pressed && styles.smallButtonPressed]}
        >
          <View style={styles.addButton}>
            {loading ? <ActivityIndicator color={colors.ink[8]} size={14} /> : sent ? <UserCheck accessible={false} color={colors.ink[8]} size={14} strokeWidth={2} /> : <UserPlus accessible={false} color={colors.ink[8]} size={14} strokeWidth={2} />}
            <Text style={styles.addButtonText}>{sent ? "Sent" : "Add"}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function SearchDropdown({
  currentUserId,
  error,
  friendIds,
  incomingIds,
  isTagMode,
  loading,
  nearby,
  others,
  sentRequestUserIds,
  tagSuggestions,
  userSearchEnabled,
  friendLoadingId,
  onAddFriend,
  onSelectTag,
  onSelectUser,
}: {
  currentUserId?: string;
  error: boolean;
  friendIds: Set<string>;
  incomingIds: Set<string>;
  isTagMode: boolean;
  loading: boolean;
  nearby: SearchUserResult[];
  others: SearchUserResult[];
  sentRequestUserIds: string[];
  tagSuggestions: SearchTagResult[];
  userSearchEnabled: boolean;
  friendLoadingId: string | null;
  onAddFriend: (userId: string, event?: GestureResponderEvent) => void;
  onSelectTag: (tag: SearchTagResult) => void;
  onSelectUser: (userId: string) => void;
}) {
  const hasUsers = nearby.length > 0 || others.length > 0;
  const sentRequestIds = useMemo(() => new Set(sentRequestUserIds), [sentRequestUserIds]);

  return (
    <View style={styles.searchDropdown}>
      {loading ? (
        <View style={styles.searchSkeletons}>
          <Skeleton style={styles.searchSkeleton} />
          <Skeleton style={styles.searchSkeleton} />
          <Skeleton style={styles.searchSkeleton} />
        </View>
      ) : error ? (
        <Text style={styles.searchEmpty}>Could not search. Try again.</Text>
      ) : isTagMode ? (
        tagSuggestions.length > 0 ? (
          <View>
            <Text style={styles.searchGroupLabel}>INTERESTS</Text>
            {tagSuggestions.map((tag) => (
              <Pressable
                accessibilityRole="button"
                key={tag.id}
                onPress={() => onSelectTag(tag)}
                style={({ pressed }) => [styles.tagSuggestion, pressed && styles.searchRowPressed]}
              >
                {tag.icon ? <Text style={styles.tagSuggestionIcon}>{tag.icon}</Text> : null}
                <Text style={styles.tagSuggestionText}>{tag.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.searchEmpty}>No results</Text>
        )
      ) : !userSearchEnabled ? (
        <Text style={styles.searchEmpty}>Type a name or @interest</Text>
      ) : hasUsers ? (
        <View style={styles.searchResultsScroll}>
          {nearby.length > 0 ? (
            <>
              <Text style={styles.searchGroupLabel}>NEARBY</Text>
              {nearby.map((user) => (
                <SearchUserRow
                  currentUserId={currentUserId}
                  friend={friendIds.has(user.id)}
                  incoming={incomingIds.has(user.id)}
                  key={user.id}
                  loading={friendLoadingId === user.id}
                  sent={sentRequestIds.has(user.id)}
                  user={user}
                  onAddFriend={onAddFriend}
                  onSelect={onSelectUser}
                />
              ))}
            </>
          ) : null}
          {others.length > 0 ? (
            <>
              <Text style={styles.searchGroupLabel}>PEOPLE</Text>
              {others.map((user) => (
                <SearchUserRow
                  currentUserId={currentUserId}
                  friend={friendIds.has(user.id)}
                  incoming={incomingIds.has(user.id)}
                  key={user.id}
                  loading={friendLoadingId === user.id}
                  sent={sentRequestIds.has(user.id)}
                  user={user}
                  onAddFriend={onAddFriend}
                  onSelect={onSelectUser}
                />
              ))}
            </>
          ) : null}
        </View>
      ) : (
        <Text style={styles.searchEmpty}>No results</Text>
      )}
    </View>
  );
}

function SearchUserRow({
  currentUserId,
  friend,
  incoming,
  loading,
  sent,
  user,
  onAddFriend,
  onSelect,
}: {
  currentUserId?: string;
  friend: boolean;
  incoming: boolean;
  loading: boolean;
  sent: boolean;
  user: SearchUserResult;
  onAddFriend: (userId: string, event?: GestureResponderEvent) => void;
  onSelect: (userId: string) => void;
}) {
  const showAdd = !friend && !incoming && user.id !== currentUserId;
  return (
    <View style={styles.searchUserRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelect(user.id)}
        style={({ pressed }) => [styles.searchUserMain, pressed && styles.searchRowPressed]}
      >
        <Avatar
          name={user.display_name || user.username}
          uri={user.avatar_url}
          size={36}
          online={user.is_online}
        />
        <View style={styles.searchUserInfo}>
          <View style={styles.searchUserIdentity}>
            <Text numberOfLines={1} style={styles.searchUserName}>{user.display_name}</Text>
            <Text numberOfLines={1} style={styles.searchUserHandle}>@{user.username}</Text>
          </View>
          {user.matched_tags.length > 0 ? (
            <View style={styles.matchedTags}>
              {user.matched_tags.map((tag) => (
                <Badge key={tag.id} tone="muted" style={styles.matchedTag} textStyle={styles.matchedTagText}>
                  {tag.icon ? `${tag.icon} ` : ""}{tag.name}
                </Badge>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
      {showAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || sent }}
          disabled={loading || sent}
          onPress={(event) => onAddFriend(user.id, event)}
          style={({ pressed }) => [styles.searchAddButton, pressed && styles.smallButtonPressed]}
        >
          <View style={styles.addButton}>
            {loading ? (
              <ActivityIndicator color={colors.ink[8]} size={14} />
            ) : sent ? (
              <UserCheck accessible={false} color={colors.ink[8]} size={14} strokeWidth={2} />
            ) : (
              <UserPlus accessible={false} color={colors.ink[8]} size={14} strokeWidth={2} />
            )}
            <Text style={styles.addButtonText}>{sent ? "Sent" : "Add"}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function HighlightedUserCard({
  data,
  insetsBottom,
  isFriend,
  isOnline,
  premium,
  user,
  onClose,
  onProfile,
  onSayHi,
}: {
  data: PublicProfileData;
  insetsBottom: number;
  isFriend: boolean;
  isOnline: boolean;
  premium: boolean;
  user: NearbyUser;
  onClose: () => void;
  onProfile: () => void;
  onSayHi: () => void;
}) {
  const name = displayName(user);
  const interests = data.interests
    .filter((interest): interest is ProfileInterest & { tag: InterestTag } => !!interest.tag?.name)
    .slice(0, 3)
    .map((interest) => interest.tag.name);

  return (
    <View style={[styles.highlightedCard, { bottom: insetsBottom + 108 }]}>
      <View style={styles.highlightedHeader}>
        <Avatar name={name} uri={user.avatar_url} size={56} />
        <View style={styles.highlightedIdentity}>
          <View style={styles.nameBadgeRow}>
            <Text numberOfLines={1} style={styles.highlightedName}>{name}</Text>
            {premium ? <PremiumBadge showText /> : null}
          </View>
          {isOnline ? <Text style={styles.onlineNow}>● Online now</Text> : null}
        </View>
        <IconButton icon="close" label="Close" size={32} variant="ghost" onPress={onClose} />
      </View>

      {interests.length > 0 ? (
        <View style={styles.interestChips}>
          {interests.map((interest) => (
            <View key={interest} style={styles.interestChip}>
              <Text style={styles.interestChipText}>{interest}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.highlightedActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onSayHi}
          style={({ pressed }) => [styles.highlightedButton, styles.sayHiButton, pressed && styles.highlightedButtonPressed]}
        >
          <Text style={styles.wave}>👋</Text>
          <Text style={styles.sayHiText}>Say hi</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onProfile}
          style={({ pressed }) => [styles.highlightedButton, styles.profileButton, pressed && styles.highlightedButtonPressed]}
        >
          <Text style={styles.profileButtonText}>Profile</Text>
        </Pressable>
      </View>

      {!isFriend ? (
        <Text style={styles.coinCost}>
          Costs <Text style={styles.coinCostStrong}>1 coin</Text> to open a chat with a non-friend
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapTarget: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  locationGate: {
    flex: 1,
    paddingHorizontal: spacing[8],
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    backgroundColor: colors.background,
  },
  locationTitle: {
    ...typography.title3,
    color: colors.ink[9],
    textAlign: "center",
  },
  locationDescription: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  locationHelp: {
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  locationRetry: {
    minHeight: minimumActivationSize,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: radii.md,
    backgroundColor: colors.ink[9],
  },
  locationRetryText: {
    color: colors.background,
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
  },
  discoveryStatus: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "80%",
    minHeight: minimumActivationSize,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  discoveryStatusText: {
    color: colors.ink[6],
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    textAlign: "center",
  },
  searchRow: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchColumn: {
    position: "relative",
    zIndex: 2,
    flex: 1,
  },
  searchPill: {
    width: "100%",
    minHeight: minimumActivationSize,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  searchDropdown: {
    position: "absolute",
    top: minimumActivationSize + 4,
    right: 0,
    left: 0,
    zIndex: 50,
    maxHeight: 360,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  searchSkeletons: {
    padding: spacing[2],
    gap: spacing[2],
  },
  searchSkeleton: {
    height: 40,
    width: "100%",
  },
  searchResultsScroll: {
    maxHeight: 360,
  },
  searchGroupLabel: {
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
    paddingHorizontal: spacing[3],
    color: colors.ink[4],
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  searchEmpty: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[4],
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  tagSuggestion: {
    minHeight: minimumActivationSize,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  tagSuggestionIcon: {
    fontSize: 16,
    lineHeight: 20,
  },
  tagSuggestionText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  searchRowPressed: {
    backgroundColor: colors.ink[1],
  },
  searchUserRow: {
    minHeight: 52,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  searchUserMain: {
    flex: 1,
    minHeight: minimumActivationSize,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  searchUserInfo: {
    flex: 1,
    minWidth: 0,
  },
  searchUserIdentity: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  searchUserName: {
    maxWidth: "58%",
    color: colors.ink[9],
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  searchUserHandle: {
    maxWidth: "40%",
    color: colors.ink[5],
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  matchedTags: {
    marginTop: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[1],
  },
  matchedTag: {
    minWidth: 0,
    height: 18,
    paddingHorizontal: 6,
  },
  matchedTagText: {
    fontSize: 12,
    lineHeight: 12,
  },
  searchAddButton: {
    minHeight: minimumActivationSize,
    alignItems: "center",
    justifyContent: "center",
  },
  searchText: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    color: colors.ink[8],
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 20,
  },
  filterSurface: {
    width: minimumActivationSize,
    height: minimumActivationSize,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  markerActionOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing[3],
    backgroundColor: "rgba(16,16,24,0.38)",
  },
  markerActionSheet: {
    maxHeight: "72%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  markerActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingBottom: spacing[3],
  },
  markerActionHeading: {
    flex: 1,
    minWidth: 0,
  },
  markerActionTitle: {
    ...typography.title3,
    color: colors.ink[9],
  },
  markerActionDescription: {
    ...typography.caption,
    color: colors.ink[5],
  },
  markerAction: {
    minHeight: minimumActivationSize,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
  },
  markerActionSelected: {
    backgroundColor: colors.primary[100],
  },
  markerActionDisabled: {
    opacity: 0.52,
  },
  markerActionPressed: {
    backgroundColor: colors.ink[1],
  },
  markerActionText: {
    flex: 1,
    minWidth: 0,
  },
  markerActionLabel: {
    ...typography.bodyBold,
    color: colors.ink[9],
  },
  markerActionDetail: {
    ...typography.caption,
    color: colors.ink[5],
  },
  markerActionEmpty: {
    minHeight: minimumActivationSize,
    paddingVertical: spacing[3],
    color: colors.ink[5],
    textAlign: "center",
  },
  topLabels: {
    position: "absolute",
    left: spacing[4],
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  onlinePill: {
    height: 36,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.e1,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success[500],
  },
  pillText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  coinPill: {
    height: 36,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.ink[9],
  },
  coinText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  coinSubtext: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  recenter: {
    position: "absolute",
    right: spacing[4],
    zIndex: 40,
  },
  pinShadow: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    boxShadow: "0 4px 6px rgba(0,0,0,0.22)",
  },
  annotationTarget: {
    width: minimumActivationSize,
    height: minimumActivationSize,
    alignItems: "center",
    justifyContent: "center",
  },
  selfPinShadow: {
    boxShadow: "0 6px 9px rgba(124,58,237,0.4)",
  },
  highlightedPinShadow: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
    backgroundColor: colors.primary[100],
    padding: 4,
    boxShadow: "0 6px 12px rgba(124,58,237,0.5)",
  },
  pinPending: {
    opacity: 0.75,
  },
  pinLoader: {
    position: "absolute",
  },
  cluster: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[9],
    boxShadow: "0 4px 6px rgba(0,0,0,0.28)",
  },
  clusterSelected: {
    borderColor: colors.primary[500],
    transform: [{ scale: 1.15 }],
    boxShadow: "0 4px 6px rgba(124,58,237,0.45)",
  },
  clusterText: {
    color: colors.surface,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  botPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.e2,
  },
  botCollectable: {
    backgroundColor: colors.warn[500],
  },
  botFar: {
    backgroundColor: colors.ink[3],
  },
  nearbyRail: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 40,
  },
  nearbyRailContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  nearbyCard: {
    minHeight: 76,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(221,221,229,0.72)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  nearbyCardSelected: {
    borderWidth: 2,
    borderColor: colors.primary[500],
  },
  nearbyCardPending: {
    opacity: 0.6,
  },
  nearbyCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  cardMain: {
    flex: 1,
    minHeight: minimumActivationSize,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  nearbyInfo: {
    flex: 1,
    minWidth: 0,
  },
  nearbyName: {
    ...typography.bodyBold,
    color: colors.ink[9],
  },
  nearbyMeta: {
    ...typography.caption,
    color: colors.ink[5],
    marginTop: 2,
  },
  addButton: {
    height: mapTouchGeometry.compactControlVisualHeight,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    backgroundColor: colors.surface,
  },
  compactButtonTarget: {
    minHeight: minimumActivationSize,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  smallButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  highlightedCard: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    zIndex: 45,
    borderRadius: 22,
    padding: spacing[4],
    backgroundColor: colors.surface,
    ...shadows.e2,
  },
  highlightedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  highlightedIdentity: {
    flex: 1,
    minWidth: 0,
  },
  nameBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  highlightedName: {
    ...typography.title3,
    color: colors.ink[9],
    flexShrink: 1,
  },
  onlineNow: {
    ...typography.caption,
    color: colors.success[600],
    fontFamily: fontFamilies.semibold,
    fontWeight: "600",
    marginTop: 2,
  },
  interestChips: {
    marginTop: spacing[3],
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  interestChip: {
    height: 26,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: spacing[3],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink[1],
  },
  interestChipText: {
    color: colors.ink[7],
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  highlightedActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: spacing[2],
  },
  highlightedButton: {
    flex: 1,
    minHeight: minimumActivationSize,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  sayHiButton: {
    backgroundColor: colors.primary[500],
  },
  sayHiText: {
    color: colors.surface,
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  wave: {
    fontSize: 16,
    lineHeight: 20,
  },
  profileButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  profileButtonText: {
    color: colors.ink[8],
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  highlightedButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  coinCost: {
    ...typography.caption,
    color: colors.ink[5],
    textAlign: "center",
    marginTop: 10,
  },
  coinCostStrong: {
    color: colors.ink[7],
    fontFamily: fontFamilies.bold,
    fontWeight: "700",
  },
  notice: {
    position: "absolute",
    left: "50%",
    zIndex: 50,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.ink[9],
    transform: [{ translateX: -70 }],
    ...shadows.e2,
  },
  noticeText: {
    color: colors.surface,
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
});
