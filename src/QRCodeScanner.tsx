import React, { useState, useEffect } from "react";
import QrScanner from "react-qr-scanner";

interface QRCodeScannerProps {
  onScan: (address: string) => void;
  onClose: () => void;
  debug?: boolean;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onScan,
  onClose,
  debug = false,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const handleScan = (data: { text: string } | null) => {
    if (data && data.text) {
      console.log("QR Code scanned:", data.text);

      // For debugging purposes, show the raw QR code content
      if (debug) {
        setError(
          `Raw QR code content: ${data.text.substring(0, 100)}${data.text.length > 100 ? "..." : ""}`,
        );
      }

      let address = data.text;

      // Try to extract wallet address from QR code data
      // Handle different formats:

      // 1. Direct Ethereum address
      const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/i;

      // 2. Metri wallet format - based on the image, it might contain the address in a specific section
      // Look for wallet address in the QR code content
      const metriWalletRegex = /Wallet Address\s*[:=]?\s*(0x[a-fA-F0-9]{40})/i;
      const metriMatch = data.text.match(metriWalletRegex);

      if (metriMatch && metriMatch[1]) {
        // Extract address from Metri wallet format
        address = metriMatch[1];
        console.log("Extracted address from Metri wallet format:", address);
      }

      // 3. Look for any Ethereum address pattern in the text
      if (!ethAddressRegex.test(address)) {
        const anyEthAddressRegex = /(0x[a-fA-F0-9]{40})/i;
        const anyMatch = data.text.match(anyEthAddressRegex);
        if (anyMatch && anyMatch[1]) {
          address = anyMatch[1];
          console.log("Extracted address from general text:", address);
        }
      }

      // 4. JSON format (some QR codes might contain JSON with address)
      if (!ethAddressRegex.test(address)) {
        try {
          const jsonData = JSON.parse(data.text);
          if (jsonData.address && ethAddressRegex.test(jsonData.address)) {
            address = jsonData.address;
            console.log("Extracted address from JSON format:", address);
          } else if (jsonData.wallet && ethAddressRegex.test(jsonData.wallet)) {
            address = jsonData.wallet;
            console.log("Extracted wallet from JSON format:", address);
          } else {
            // Try to find any property that looks like an Ethereum address
            for (const key in jsonData) {
              if (
                typeof jsonData[key] === "string" &&
                ethAddressRegex.test(jsonData[key])
              ) {
                address = jsonData[key];
                console.log(
                  `Extracted address from JSON property ${key}:`,
                  address,
                );
                break;
              }
            }
          }
        } catch (e) {
          // Not JSON format, continue with other checks
          console.log("Not a valid JSON format:", e);
        }
      }

      // 5. URL format with address parameter or path component
      if (!ethAddressRegex.test(address)) {
        try {
          // Check URL parameters
          const url = new URL(data.text);
          const urlAddress =
            url.searchParams.get("address") ||
            url.searchParams.get("wallet") ||
            url.searchParams.get("a");

          if (urlAddress && ethAddressRegex.test(urlAddress)) {
            address = urlAddress;
            console.log("Extracted address from URL parameter:", address);
          } else {
            // Check if address is in the path
            const pathParts = url.pathname.split("/");
            for (const part of pathParts) {
              if (ethAddressRegex.test(part)) {
                address = part;
                console.log("Extracted address from URL path:", address);
                break;
              }
            }
          }
        } catch (e) {
          // Not URL format, continue with other checks
          console.log("Not a valid URL format:", e);
        }
      }

      // 6. Handle Metri profile URL directly
      if (
        !ethAddressRegex.test(address) &&
        data.text.includes("app.metri.xyz/p/profile/")
      ) {
        try {
          const metriProfileRegex =
            /app\.metri\.xyz\/p\/profile\/(0x[a-fA-F0-9]{40})/i;
          const metriProfileMatch = data.text.match(metriProfileRegex);
          if (metriProfileMatch && metriProfileMatch[1]) {
            address = metriProfileMatch[1];
            console.log("Extracted address from Metri profile URL:", address);
          }
        } catch (e) {
          console.log("Error parsing Metri profile URL:", e);
        }
      }

      // Final validation
      if (ethAddressRegex.test(address)) {
        onScan(address);
      } else {
        console.error("Could not extract valid wallet address from QR code");
        setError(
          "Could not find a valid wallet address in the QR code. Raw content: " +
            data.text.substring(0, 50) +
            "...",
        );
      }
    }
  };

  // Get available camera devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        console.log("Requesting camera permission...");

        // Force the audio: false and video: true constraint format
        await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });

        // Then get list of available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput",
        );

        if (videoDevices.length === 0) {
          throw new Error("No camera devices found");
        }

        setDevices(videoDevices);

        // Log all available cameras for debugging
        videoDevices.forEach((device, index) => {
          console.log(
            `Camera ${index + 1}:`,
            device.label || `Camera ${index + 1}`,
          );
        });

        // Just select the first camera for now
        setSelectedDeviceId(videoDevices[0].deviceId);
        setCameraReady(true);
      } catch (error) {
        console.error("Error getting camera devices:", error);
        setError(
          "Error accessing camera: " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    };

    getDevices();
  }, []);

  const handleError = (err: Error) => {
    console.error("QR Scanner error:", err);
    setError("Error accessing camera: " + err.message);
  };

  const changeCamera = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setError(null);
    setCameraReady(false);
    setTimeout(() => setCameraReady(true), 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4">
        <h3 className="text-xl font-bold mb-4 text-center">Scan QR Code</h3>

        <p className="text-sm text-gray-600 mb-2 text-center">
          {devices.length === 0
            ? "Accessing camera..."
            : selectedDeviceId
              ? `Using: ${devices.find((d) => d.deviceId === selectedDeviceId)?.label || "Selected camera"}`
              : "No camera selected"}
        </p>

        <div className="w-full aspect-square relative bg-gray-100 overflow-hidden rounded-lg mb-4">
          {cameraReady && selectedDeviceId && (
            <QrScanner
              delay={300}
              onError={handleError}
              onScan={handleScan}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              constraints={
                {
                  video: selectedDeviceId
                    ? { deviceId: { exact: selectedDeviceId } }
                    : true, // fallback to default camera
                  audio: false,
                } as MediaTrackConstraints
              }
            />
          )}
          {/* Overlay with scanning frame */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3/4 h-3/4 border-2 border-[#FFB800] rounded-lg"></div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {devices.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium mb-1">
              Camera not working? Try another:
            </p>
            <select
              value={selectedDeviceId || ""}
              onChange={(e) => changeCamera(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
            >
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Note: If scanning doesn't work, try the front camera. Some devices
              label cameras incorrectly.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 bg-[#FFB800] hover:bg-[#E6A600] text-black font-medium rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default QRCodeScanner;
