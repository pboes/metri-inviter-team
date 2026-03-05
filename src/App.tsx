import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";
import QRCodeScanner from "./QRCodeScanner";

// Gnosis Chain configuration
const GNOSIS_CHAIN_ID = 100;
const GNOSIS_RPC_URL = "https://rpc.aboutcircles.com";

// Trust contract
const TRUST_CONTRACT_ADDRESS = "0xcC1B071e1339f9BAc3cd32a493629Dc1e12cBCb8";
const TRUST_ABI = [
  "function trustAvatar(address _avatar, uint96 _expiry) external",
];

// Far-future expiry: year 2100 as a unix timestamp
const FAR_FUTURE_EXPIRY = 4102444800;

function App() {
  // Basic state
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [scannedAddress, setScannedAddress] = useState<string | null>(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [processingTrust, setProcessingTrust] = useState(false);
  const [copied, setCopied] = useState(false);



  // Check wallet connection on load
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (window.ethereum) {
        try {
          const chainId = await window.ethereum.request({
            method: "eth_chainId",
          });
          const networkId = parseInt(chainId, 16);
          setIsCorrectNetwork(networkId === GNOSIS_CHAIN_ID);

          let ethersProvider;
          if (networkId === GNOSIS_CHAIN_ID) {
            ethersProvider = new ethers.BrowserProvider(window.ethereum);
          } else {
            ethersProvider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
          }
          const accounts = await window.ethereum.request({
            method: "eth_accounts",
          });
          if (accounts.length > 0) {
            if (networkId === GNOSIS_CHAIN_ID) {
              const ethersSigner = await ethersProvider.getSigner();
              setSigner(ethersSigner);
            }
            setWalletConnected(true);
          }

          window.ethereum.on("chainChanged", (_chainId: string) => {
            window.location.reload();
          });
        } catch (error) {
          console.error("Failed to check wallet connection:", error);
        }
      }
    };

    checkWalletConnection();
  }, []);

  // Switch to Gnosis Chain
  const switchToGnosisChain = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x64" }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x64",
                chainName: "Gnosis Chain",
                nativeCurrency: {
                  name: "xDAI",
                  symbol: "xDAI",
                  decimals: 18,
                },
                rpcUrls: ["https://rpc.gnosischain.com"],
                blockExplorerUrls: ["https://gnosisscan.io"],
              },
            ],
          });
        } catch (addError) {
          console.error("Failed to add Gnosis Chain to wallet:", addError);
        }
      } else {
        console.error("Failed to switch to Gnosis Chain:", switchError);
      }
    }
  };

  // Connect wallet
  const connectWallet = async () => {
    setErrorInfo(null);

    if (!window.ethereum) {
      setErrorInfo(
        "No Ethereum wallet detected. Please install MetaMask or another compatible wallet.",
      );
      return;
    }

    try {
      setIsLoading(true);
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      const networkId = parseInt(chainId, 16);

      if (networkId !== GNOSIS_CHAIN_ID) {
        await switchToGnosisChain();
        return;
      }

      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      const ethersSigner = await ethersProvider.getSigner();
      setSigner(ethersSigner);

      setWalletConnected(true);
      setIsCorrectNetwork(true);
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setErrorInfo(`Failed to connect wallet: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Derive profile URL from scanned address
  const getProfileUrl = (address: string) =>
    `https://circles.gnosis.io/ps/${address}`;

  // Copy profile URL to clipboard
  const handleCopyUrl = async () => {
    if (!scannedAddress) return;
    try {
      await navigator.clipboard.writeText(getProfileUrl(scannedAddress));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Call trustAvatar on the trust contract
  const handleTrustAvatar = async () => {
    if (!scannedAddress) return;

    setErrorInfo(null);
    setTxHash(null);

    if (!signer) {
      setErrorInfo("Wallet not connected. Please connect your wallet first.");
      return;
    }

    if (!isCorrectNetwork) {
      setErrorInfo("Please switch to Gnosis Chain to perform transactions.");
      await switchToGnosisChain();
      return;
    }

    try {
      setProcessingTrust(true);

      const trustContract = new ethers.Contract(
        TRUST_CONTRACT_ADDRESS,
        TRUST_ABI,
        signer,
      );

      const tx = await trustContract.trustAvatar(
        scannedAddress,
        FAR_FUTURE_EXPIRY,
      );
      await tx.wait();
      setTxHash(tx.hash);
    } catch (error) {
      console.error("Error calling trustAvatar:", error);
      setErrorInfo(`Failed to trust avatar: ${(error as Error).message}`);
    } finally {
      setProcessingTrust(false);
    }
  };

  // Handle QR scan result — extract address from app.gnosis.io profile links
  const handleScan = (raw: string) => {
    setShowScanner(false);
    setErrorInfo(null);
    setTxHash(null);

    // Try to extract address from app.gnosis.io/... URL first
    const gnosisUrlMatch = raw.match(
      /app\.gnosis\.io\/[^/]*\/?(0x[a-fA-F0-9]{40})/i,
    );
    if (gnosisUrlMatch) {
      const address = gnosisUrlMatch[1];
      setScannedAddress(address);
      setWalletAddress(address);
      return;
    }

    // Fallback: plain Ethereum address anywhere in the string
    const ethMatch = raw.match(/(0x[a-fA-F0-9]{40})/i);
    if (ethMatch) {
      const address = ethMatch[1];
      setScannedAddress(address);
      setWalletAddress(address);
      return;
    }

    setErrorInfo("No Ethereum address found in scanned QR code.");
  };

  const handleCloseScanner = () => setShowScanner(false);

  const handleOpenScanner = () => {
    setErrorInfo(null);
    setTxHash(null);
    setScannedAddress(null);
    setWalletAddress("");
    setShowScanner(true);
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWalletAddress(value);
    setTxHash(null);

    if (/^0x[a-fA-F0-9]{40}$/i.test(value)) {
      setScannedAddress(value);
      setErrorInfo(null);
    } else {
      setScannedAddress(null);
    }
  };

  return (
    <div className="App">
      <h1>Circles Onboarding Helper</h1>

      {/* Wallet connection */}
      <div className="wallet-connection">
        {walletConnected ? (
          <div className="text-center">
            <p className="text-green-600 font-bold">✓ Wallet Connected</p>
            {!isCorrectNetwork && (
              <div className="network-warning" style={{ marginTop: "0.5rem" }}>
                <button
                  onClick={switchToGnosisChain}
                  className="switch-network-button"
                >
                  Switch to Gnosis Chain
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={connectWallet}
            disabled={isLoading}
            className="connect-wallet-button"
          >
            {isLoading ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>

      {/* Scan button */}
      <div className="scan-button-container">
        <button onClick={handleOpenScanner} className="scan-button">
          Scan QR Code
        </button>
      </div>

      {/* Scanner overlay */}
      {showScanner && (
        <QRCodeScanner
          onScan={handleScan}
          onClose={handleCloseScanner}
          debug={false}
        />
      )}

      {/* Manual address input */}
      <div className="input-container">
        <input
          type="text"
          placeholder="Or enter address manually (0x...)"
          value={walletAddress}
          onChange={handleAddressChange}
          className="wallet-input"
        />
      </div>

      {/* Error display */}
      {errorInfo && <p className="error-message">{errorInfo}</p>}

      {/* Profile URL + actions — only shown when a valid address is present */}
      {scannedAddress && (
        <div className="tab-content">
          {/* Profile URL display */}
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "#15803d",
                fontWeight: 600,
                marginBottom: "0.25rem",
              }}
            >
              Circles Profile URL
            </p>
            <p
              style={{
                fontSize: "0.8rem",
                color: "#166534",
                wordBreak: "break-all",
                marginBottom: "0.5rem",
              }}
            >
              {getProfileUrl(scannedAddress)}
            </p>
            <div className="action-buttons-container">
              <button
                onClick={handleCopyUrl}
                className="action-button"
                style={{
                  background: copied ? "#16a34a" : "#22c55e",
                  color: "#fff",
                  minWidth: "120px",
                }}
              >
                {copied ? "✓ Copied!" : "Copy URL"}
              </button>
              <a
                href={getProfileUrl(scannedAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="action-button"
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Open Profile ↗
              </a>
            </div>
          </div>

          {/* Trust Avatar button */}
          <div className="action-buttons-container">
            <button
              onClick={handleTrustAvatar}
              disabled={
                processingTrust || !walletConnected || !isCorrectNetwork
              }
              className="action-button group-button"
              style={{ width: "100%" }}
            >
              {processingTrust ? "Trusting…" : "Trust Avatar"}
            </button>
          </div>

          {!walletConnected && (
            <p
              style={{
                textAlign: "center",
                fontSize: "0.8rem",
                color: "#6b7280",
                marginTop: "0.5rem",
              }}
            >
              Connect your wallet above to trust this avatar.
            </p>
          )}

          {walletConnected && !isCorrectNetwork && (
            <p
              style={{
                textAlign: "center",
                fontSize: "0.8rem",
                color: "#d97706",
                marginTop: "0.5rem",
              }}
            >
              Switch to Gnosis Chain to trust this avatar.
            </p>
          )}

          {/* Transaction success */}
          {txHash && (
            <div className="success-box" style={{ marginTop: "1rem" }}>
              <h3>✅ Avatar Trusted</h3>
              <p className="break-all" style={{ fontSize: "0.75rem" }}>
                {txHash}
              </p>
              <a
                href={`https://gnosisscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="view-tx-button"
              >
                View Transaction
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
