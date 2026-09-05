import React from "react";
import { AppState } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockRequestPermission = jest.fn();
const mockCameraProps: { current: Record<string, unknown> | null } = { current: null };
let mockPermissionState: { granted: boolean; canAskAgain: boolean } | null = null;

jest.mock("expo-camera", () => ({
  CameraView: (props: Record<string, unknown>) => {
    mockCameraProps.current = props;
    return null;
  },
  useCameraPermissions: () => [mockPermissionState, mockRequestPermission],
}));

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
    scan({ data: "  https://example.invalid/qr?id=7  " });
    scan({ data: "  https://example.invalid/qr?id=7  " });
    expect(onDecoded).toHaveBeenCalledTimes(1);
    expect(onDecoded).toHaveBeenCalledWith("  https://example.invalid/qr?id=7  ");
    resolve();
  });

  it("shows permission denial and still allows the manual fallback", async () => {
    mockPermissionState = { granted: false, canAskAgain: false };
    const onDecoded = jest.fn(async () => undefined);
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={onDecoded} />);

    expect(result.getByRole("alert")).toBeTruthy();
    fireEvent.changeText(result.getByLabelText("QR text"), "plain QR text");
    fireEvent.press(result.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(onDecoded).toHaveBeenCalledWith("plain QR text"));
  });

  it("offers retry after a failed join", async () => {
    const onDecoded = jest.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const result = render(<QrScanner open onClose={jest.fn()} onDecoded={onDecoded} />);

    await waitFor(() => expect(mockCameraProps.current?.active).toBe(true));
    (mockCameraProps.current?.onBarcodeScanned as ((value: { data: string }) => void))({ data: "retryable" });
    await waitFor(() => expect(result.getByText("This QR code could not be joined. Check your connection and try again.")).toBeTruthy());
    fireEvent.press(result.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onDecoded).toHaveBeenCalledTimes(2));
  });

  it("closes on backgrounding and removes the app-state listener", () => {
    const remove = jest.fn();
    const listener = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
      listener.mockImplementation(callback);
      return { remove };
    });
    const onClose = jest.fn();
    const result = render(<QrScanner open onClose={onClose} onDecoded={jest.fn(async () => undefined)} />);

    listener("background");
    expect(onClose).toHaveBeenCalledTimes(1);
    result.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
