import React from "react";
import { AppState } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockRequestPermission = jest.fn();
const mockCameraProps: { current: Record<string, unknown> | null } = { current: null };
let mockPermissionState: { granted: boolean; canAskAgain: boolean } | null = null;

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("expo-camera", () => ({
  CameraView: (props: Record<string, unknown>) => {
    mockCameraProps.current = props;
    return null;
  },
  useCameraPermissions: () => [mockPermissionState, mockRequestPermission],
}));

jest.mock("@/components/ui", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    Button: ({ children, disabled, onPress }: { children: React.ReactNode; disabled?: boolean; onPress: () => void }) => React.createElement(
      Pressable,
      { accessibilityRole: "button", accessibilityState: { disabled }, disabled, onPress },
      React.createElement(Text, null, children),
    ),
    Caption: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => React.createElement(
      Pressable,
      { accessibilityLabel: label, accessibilityRole: "button", onPress },
    ),
  };
});

import { QrScanner } from "@/components/qr-scanner";

describe("native QR scanner lifecycle", () => {
  beforeEach(() => {
    mockPermissionState = { granted: true, canAskAgain: true };
    mockRequestPermission.mockReset();
    mockCameraProps.current = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("submits one exact camera detection while suppressing duplicate frames", async () => {
    let resolve!: () => void;
    const onDecoded = jest.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<QrScanner open onClose={jest.fn()} onDecoded={onDecoded} />);

    await waitFor(() => expect(mockCameraProps.current?.active).toBe(true));
    const scan = mockCameraProps.current?.onBarcodeScanned as ((value: { data: string }) => void);
    await act(async () => {
      scan({ data: "  https://example.invalid/qr?id=7  " });
      scan({ data: "  https://example.invalid/qr?id=7  " });
    });
    expect(onDecoded).toHaveBeenCalledTimes(1);
    expect(onDecoded).toHaveBeenCalledWith("  https://example.invalid/qr?id=7  ");
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
  });

  it("requests permission only once during a denied scanner session", async () => {
    mockPermissionState = { granted: false, canAskAgain: true };
    mockRequestPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={jest.fn(async () => undefined)} />);

    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
    mockPermissionState = { granted: false, canAskAgain: true };
    result.rerender(<QrScanner open onClose={jest.fn()} onDecoded={jest.fn(async () => undefined)} />);
    await waitFor(() => expect(result.getByRole("alert")).toBeTruthy());
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it("shows permission denial without a typed or pasted fallback", () => {
    mockPermissionState = { granted: false, canAskAgain: false };
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={jest.fn(async () => undefined)} />);

    expect(result.getByRole("alert")).toBeTruthy();
    expect(result.queryByLabelText("QR text")).toBeNull();
    expect(result.queryByRole("button", { name: "Join" })).toBeNull();
  });

  it("shows a camera startup error when the preview cannot mount", async () => {
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={jest.fn(async () => undefined)} />);

    await waitFor(() => expect(mockCameraProps.current?.active).toBe(true));
    await act(async () => {
      (mockCameraProps.current?.onMountError as () => void)();
    });
    expect(result.getByRole("alert")).toBeTruthy();
    expect(result.getByText("The camera could not start. Try again.")).toBeTruthy();
  });

  it("shows the camera fallback when permission request is rejected", async () => {
    mockPermissionState = null;
    mockRequestPermission.mockRejectedValueOnce(new Error("permission unavailable"));
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={jest.fn(async () => undefined)} />);

    await waitFor(() => expect(result.getByRole("alert")).toBeTruthy());
    expect(result.getByText("The camera could not start. Try again.")).toBeTruthy();
  });

  it("offers retry after a failed join", async () => {
    const onDecoded = jest.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={onDecoded} />);

    await waitFor(() => expect(mockCameraProps.current?.active).toBe(true));
    await act(async () => {
      (mockCameraProps.current?.onBarcodeScanned as ((value: { data: string }) => void))({ data: "retryable" });
    });
    await waitFor(() => expect(result.getByText("This QR code could not be joined. Check your connection and try again.")).toBeTruthy());
    fireEvent.press(result.getByRole("button", { name: "Retry joining" }));
    await waitFor(() => expect(onDecoded).toHaveBeenCalledTimes(2));
  });

  it("does not render typed or pasted QR entry", async () => {
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={jest.fn(async () => undefined)} />);

    expect(result.queryByLabelText("QR text")).toBeNull();
    expect(result.queryByRole("button", { name: "Join" })).toBeNull();
  });

  it("closes on inactive and background states and removes the app-state listener", () => {
    const remove = jest.fn();
    const listener = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
      listener.mockImplementation(callback);
      return { remove };
    });
    const onClose = jest.fn();
    const result = render(<QrScanner open onClose={onClose} onDecoded={jest.fn(async () => undefined)} />);

    listener("inactive");
    expect(onClose).toHaveBeenCalledTimes(1);
    listener("background");
    expect(onClose).toHaveBeenCalledTimes(2);
    result.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("keeps the permission prompt open through inactive and closes after permission recovers", async () => {
    mockPermissionState = { granted: false, canAskAgain: true };
    let resolvePermission!: (value: { granted: boolean; canAskAgain: boolean }) => void;
    mockRequestPermission.mockReturnValue(new Promise<{ granted: boolean; canAskAgain: boolean }>((resolve) => {
      resolvePermission = resolve;
    }));
    const remove = jest.fn();
    const listener = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
      listener.mockImplementation(callback);
      return { remove };
    });
    const onClose = jest.fn();
    render(<QrScanner open onClose={onClose} onDecoded={jest.fn(async () => undefined)} />);

    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
    listener("inactive");
    expect(onClose).not.toHaveBeenCalled();

    mockPermissionState = { granted: true, canAskAgain: true };
    await act(async () => {
      resolvePermission({ granted: true, canAskAgain: true });
    });
    await waitFor(() => expect(mockCameraProps.current?.active).toBe(true));
    listener("inactive");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
