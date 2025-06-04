declare module "react-qr-scanner" {
  import React from "react";

  interface QrScannerProps {
    delay?: number;
    style?: React.CSSProperties;
    onError: (error: Error) => void;
    onScan: (data: { text: string } | null) => void;
    constraints?: MediaStreamConstraints;
    resolution?: number;
    facingMode?: string;
    chooseDeviceId?: () => string;
    legacyMode?: boolean;
    maxImageSize?: number;
  }

  const QrScanner: React.ComponentType<QrScannerProps>;
  export default QrScanner;
}
