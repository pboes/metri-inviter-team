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
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    // Simple camera setup - just try to get the back camera
    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        // Get the device ID from the active stream
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          setSelectedDeviceId(videoTracks[0].getSettings().deviceId || null);
          setCameraReady(true);
        }

        // Clean up the stream we just created
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.error("Camera access error:", err);
        setError("Could not access camera. Please check permissions.");
      }
    };

    setupCamera();
  }, []);

  const handleScan = (data: { text: string } | null) => {
    if (data && data.text) {
      if (debug) {
        console.log("QR Code scanned:", data.text);
      }

      // Extract Ethereum address using a simple regex
      const ethAddressRegex = /(0x[a-fA-F0-9]{40})/i;
      const match = data.text.match(ethAddressRegex);

      if (match && match[1]) {
        const address = match[1];
        if (debug) {
          console.log("Extracted address:", address);
        }
        onScan(address);
      } else {
        setError("No Ethereum address found in QR code");
      }
    }
  };

  const handleError = (err: Error) => {
    console.error("QR Scanner error:", err);
    setError("Scanner error: " + err.message);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4">
        <h3 className="text-xl font-bold mb-4 text-center">
          Scan Metri Wallet QR Code
        </h3>

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
              constraints={{
                audio: false,
                video: {
                  deviceId: selectedDeviceId
                    ? { exact: selectedDeviceId }
                    : undefined,
                  facingMode: "environment", // Prefer back camera
                },
              }}
            />
          )}
          {/* Scanning frame with improved visibility */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3/4 h-3/4 border-4 border-[#10b981] rounded-lg"></div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default QRCodeScanner;
