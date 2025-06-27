import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";
import QRCodeScanner from "./QRCodeScanner";

// Constants
const GNOSIS_RPC_URL = "https://rpc.gnosischain.com";
const IS_HUMAN_CONTRACT = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const BACKEND_URL = "http://localhost:3000/add-to-group";
const GROUP_ADDRESS = "0x43322ADF67D969219d014D60C860966269F4F93E";

// Contract ABI for isHuman and isTrusted checks
const CONTRACT_ABI = [
  "function isHuman(address _address) view returns (bool)",
  "function isTrusted(address _truster, address _trustee) view returns (bool)",
];

function App() {
  // Basic state
  const [secretKey, setSecretKey] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [scannedAddress, setScannedAddress] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isHumanStatus, setIsHumanStatus] = useState(false);
  const [isGroupMember, setIsGroupMember] = useState(false);
  const [tallyFormOpened, setTallyFormOpened] = useState(false);
  const [provider, setProvider] = useState<ethers.Provider | null>(null);
  // New state for group addition toggle
  const [enableGroupAddition, setEnableGroupAddition] = useState(true);

  // Initialize provider
  useEffect(() => {
    const rpcProvider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
    setProvider(rpcProvider);
  }, []);

  // Function to create a hash for secure backend communication
  const createSecurityHash = (address: string, secret: string) => {
    return ethers.keccak256(
      ethers.toUtf8Bytes(`${address.toLowerCase()}${secret}`),
    );
  };

  // Open Tally form in a new tab
  const openTallyForm = (address: string) => {
    const tallyUrl = `https://tally.so/r/3jXY29?address=${encodeURIComponent(address)}`;
    window.open(tallyUrl, "_blank");
    setTallyFormOpened(true);
  };

  // Check if address is human
  const checkIsHuman = async (address: string) => {
    if (!provider) return false;

    try {
      const contract = new ethers.Contract(
        IS_HUMAN_CONTRACT,
        CONTRACT_ABI,
        provider,
      );
      return await contract.isHuman(address);
    } catch (error) {
      console.error("Error checking isHuman status:", error);
      return false;
    }
  };

  // Check if address is already a group member
  const checkIsGroupMember = async (address: string) => {
    if (!provider) return false;

    try {
      const contract = new ethers.Contract(
        IS_HUMAN_CONTRACT,
        CONTRACT_ABI,
        provider,
      );
      return await contract.isTrusted(GROUP_ADDRESS, address);
    } catch (error) {
      console.error("Error checking group membership:", error);
      return false;
    }
  };

  // Process the address (either scanned or manually entered)
  const processAddress = async (address: string) => {
    if (!ethers.isAddress(address)) {
      setErrorInfo("Invalid Ethereum address format");
      return;
    }

    setIsProcessing(true);
    setErrorInfo(null);
    setIsSuccess(false);
    setIsHumanStatus(false);
    setIsGroupMember(false);
    setTallyFormOpened(false);
    setScannedAddress(address);

    try {
      // 1. Check if the address is human and if it's already a group member
      const isHuman = await checkIsHuman(address);
      const isGroupMember = await checkIsGroupMember(address);

      setIsHumanStatus(isHuman);
      setIsGroupMember(isGroupMember);

      // If they're both human and a group member, no action needed
      if (isHuman && isGroupMember) {
        setIsProcessing(false);
        return;
      }

      let backendSuccess = true;

      // 2. Send to backend for group addition if not already a member and the toggle is enabled
      if (!isGroupMember && enableGroupAddition) {
        try {
          const securityHash = createSecurityHash(address, secretKey);

          const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              address,
              hash: securityHash,
            }),
          });

          if (!response.ok) {
            backendSuccess = false;
            const responseText = await response.text();
            throw new Error(
              `Backend error (${response.status}): ${responseText || response.statusText}`,
            );
          }
        } catch (error) {
          backendSuccess = false;
          console.error("Backend error:", error);
          setErrorInfo(
            `Backend error: ${(error as Error).message}. Tally form will still open if needed.`,
          );
        }
      }

      // 3. Open Tally form in a new tab only if not human, regardless of backend success
      if (!isHuman) {
        openTallyForm(address);
      }

      // Only show success if backend operation succeeded or if group addition was disabled
      if (backendSuccess || !enableGroupAddition) {
        setIsSuccess(true);
      }
    } catch (error) {
      console.error("Error processing address:", error);
      setErrorInfo(`Error: ${(error as Error).message}`);

      // Even if there's an error in the main process, try to open Tally form if not human
      if (!isHumanStatus && !tallyFormOpened) {
        openTallyForm(address);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to handle QR code scan result
  const handleScan = (address: string) => {
    setShowScanner(false);
    processAddress(address);
  };

  // Handle manual address submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretKey.trim()) {
      setErrorInfo("Please enter the secret key first");
      return;
    }
    processAddress(manualAddress);
  };

  // Handle opening scanner
  const handleOpenScanner = () => {
    if (!secretKey.trim()) {
      setErrorInfo("Please enter the secret key first");
      return;
    }

    setErrorInfo(null);
    setIsSuccess(false);
    setIsHumanStatus(false);
    setIsGroupMember(false);
    setTallyFormOpened(false);
    setShowScanner(true);
  };

  return (
    <div className="App">
      <h1>EthCC Onboarding Helper</h1>

      {/* Secret Key Input */}
      <div className="input-container">
        <input
          type="password"
          placeholder="Enter Secret Key"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          className="wallet-input"
        />
      </div>

      {/* Group Addition Toggle */}
      <div className="toggle-container">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={enableGroupAddition}
            onChange={(e) => setEnableGroupAddition(e.target.checked)}
          />
          <span className="toggle-text">Enable Group Addition</span>
        </label>
      </div>

      {/* Scan Button - Moved up in the order */}
      <div className="scan-button-container">
        <button
          onClick={handleOpenScanner}
          className="scan-button"
          disabled={isProcessing || !secretKey.trim()}
        >
          {isProcessing ? "Processing..." : "Scan QR Code"}
        </button>
      </div>

      {/* Scanner */}
      {showScanner && (
        <QRCodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          debug={false}
        />
      )}

      {/* Manual Address Input - Moved down in the order */}
      <div className="input-container manual-input">
        <form onSubmit={handleManualSubmit}>
          <input
            type="text"
            placeholder="Or enter Ethereum address manually"
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            className="wallet-input"
          />
          <button
            type="submit"
            className="action-button"
            disabled={
              isProcessing || !secretKey.trim() || !manualAddress.trim()
            }
          >
            Process Address
          </button>
        </form>
      </div>

      {/* Status Messages */}
      {errorInfo && <p className="error-message">{errorInfo}</p>}

      {isSuccess && (
        <div className="success-box">
          <h3>✅ Address Processed Successfully</h3>
          {!isHumanStatus && tallyFormOpened && (
            <p>The Tally form has been opened in a new tab.</p>
          )}
          {isHumanStatus && !isGroupMember && enableGroupAddition && (
            <p>Address added to the group.</p>
          )}
          {isHumanStatus && !isGroupMember && !enableGroupAddition && (
            <p>Group addition was disabled. Address not added to group.</p>
          )}
        </div>
      )}

      {!isSuccess && tallyFormOpened && (
        <div className="info-box">
          <h3>ℹ️ Tally Form Opened</h3>
          <p>The Tally form has been opened in a new tab despite errors.</p>
        </div>
      )}

      {isHumanStatus && isGroupMember && (
        <div className="info-box">
          <h3>ℹ️ Already Registered</h3>
          <p>
            This address is already registered as human and is a group member.
          </p>
        </div>
      )}

      {scannedAddress && !isProcessing && (
        <div className="address-display">
          <h3>Address:</h3>
          <p>{scannedAddress}</p>
          <p>
            <strong>Status:</strong> {isHumanStatus ? "Human ✓" : "Not Human ✗"}
            ,{isGroupMember ? "Group Member ✓" : "Not Group Member ✗"}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
