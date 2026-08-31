export type MapMarkerAccessibility = {
  label: string;
  hint: string;
  state: {
    busy?: boolean;
    disabled?: boolean;
    selected?: boolean;
  };
};

export function clusterMarkerAccessibility(
  count: number,
  zoom: number,
  selected: boolean,
): MapMarkerAccessibility {
  return {
    label: `${count} ${count === 1 ? "person" : "people"} nearby`,
    hint: `Show this cluster at map zoom ${Math.round(zoom)}`,
    state: { selected },
  };
}

export function userMarkerAccessibility(
  name: string,
  selected: boolean,
  busy: boolean,
): MapMarkerAccessibility {
  return {
    label: name,
    hint: "Select this person on the map",
    state: { busy, selected },
  };
}

export function coinMarkerAccessibility(collectable: boolean): MapMarkerAccessibility {
  return collectable
    ? {
        label: "Collect coin",
        hint: "Collect this nearby coin",
        state: { disabled: false },
      }
    : {
        label: "Coin, get closer",
        hint: "Move closer before collecting this coin",
        state: { disabled: true },
      };
}
