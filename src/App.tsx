import { useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import QRCodeScanner from "./QRCodeScanner";

declare global {
  interface Window {
    ethereum?: any;
  }
}

// Use environment variable with fallback for development/testing
const NFT_CONTRACT_ADDRESS =
  import.meta.env.VITE_NFT_CONTRACT_ADDRESS ||
  "0x9340184741D938453bF66D77d551Cc04Ab2F4925"; // Fallback address for development

// Expanded ABI with methods we need
const CONTRACT_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function getHasValidKey(address) view returns (bool)",
  "function keyExpirationTimestampFor(address) view returns (uint256)",
];

// Interface for NFT details
interface NFTDetails {
  contractName: string;
  eventName: string;
  keyExpiration?: string;
}

function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [isValidTicket, setIsValidTicket] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [nftDetails, setNftDetails] = useState<NFTDetails | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  // Function to handle validation
  const checkTicketValidity = async () => {
    setIsLoading(true);
    setIsValidTicket(null); // Reset status
    setErrorInfo(null); // Reset error message
    setDebugInfo(null); // Reset debug info

    if (!walletAddress) {
      setErrorInfo("Wallet address missing");
      setIsValidTicket(false);
      setIsLoading(false);
      return;
    }

    let normalizedAddress;
    try {
      normalizedAddress = ethers.getAddress(walletAddress);
      if (debugMode) {
        setDebugInfo(`Normalized address: ${normalizedAddress}`);
      }
    } catch (error) {
      setErrorInfo("Invalid wallet address format");
      setIsValidTicket(false);
      setIsLoading(false);
      return;
    }

    try {
      // Always use JsonRpcProvider for more reliable connections to Gnosis Chain
      const provider = new ethers.JsonRpcProvider(
        "https://rpc.gnosischain.com",
      );

      if (debugMode) {
        setDebugInfo(
          (prev) =>
            `${prev || ""}\nConnecting to Gnosis Chain via JsonRpcProvider`,
        );
      }

      // Initialize contract with expanded ABI
      const contract = new ethers.Contract(
        NFT_CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider,
      );

      let isValid = false;
      let contractName = "";
      let eventName = "Unlock Event";
      let expirationTimestamp: string | undefined;

      // Try to get contract name
      try {
        contractName = await contract.name();
        if (debugMode) {
          setDebugInfo(
            (prev) => `${prev || ""}\nContract name: ${contractName}`,
          );
        }
      } catch (nameError) {
        console.error("Error getting contract name:", nameError);
        if (debugMode) {
          setDebugInfo(
            (prev) =>
              `${prev || ""}\nError getting contract name: ${(nameError as Error).message}`,
          );
        }
        contractName = "Unlock Protocol NFT";
      }

      // First try getHasValidKey if available (Unlock Protocol's preferred method)
      try {
        if (debugMode) {
          setDebugInfo(
            (prev) =>
              `${prev || ""}\nTrying getHasValidKey for ${normalizedAddress}`,
          );
        }

        isValid = await contract.getHasValidKey(normalizedAddress);

        if (debugMode) {
          setDebugInfo(
            (prev) => `${prev || ""}\ngetHasValidKey result: ${isValid}`,
          );
        }

        // If valid, try to get expiration timestamp
        if (isValid) {
          try {
            const expiration =
              await contract.keyExpirationTimestampFor(normalizedAddress);
            const expirationDate = new Date(Number(expiration) * 1000);
            expirationTimestamp = expirationDate.toLocaleString();

            if (debugMode) {
              setDebugInfo(
                (prev) => `${prev || ""}\nKey expires: ${expirationTimestamp}`,
              );
            }
          } catch (expError) {
            console.error("Error getting expiration:", expError);
            if (debugMode) {
              setDebugInfo(
                (prev) =>
                  `${prev || ""}\nError getting expiration: ${(expError as Error).message}`,
              );
            }
          }
        }
      } catch (validKeyError) {
        console.error("Error checking getHasValidKey:", validKeyError);

        if (debugMode) {
          setDebugInfo(
            (prev) =>
              `${prev || ""}\ngetHasValidKey not available or error: ${(validKeyError as Error).message}`,
          );
          setDebugInfo(
            (prev) => `${prev || ""}\nFalling back to balanceOf check`,
          );
        }

        // Fall back to balance check if getHasValidKey is not available
        try {
          if (debugMode) {
            setDebugInfo(
              (prev) =>
                `${prev || ""}\nChecking balance for ${normalizedAddress}`,
            );
          }

          const balance = await contract.balanceOf(normalizedAddress);

          if (debugMode) {
            setDebugInfo(
              (prev) => `${prev || ""}\nBalance: ${balance.toString()}`,
            );
          }

          isValid = balance > 0n;

          if (debugMode) {
            setDebugInfo(
              (prev) => `${prev || ""}\nBalance check result: ${isValid}`,
            );
          }
        } catch (balanceError) {
          console.error("Error checking balance:", balanceError);
          if (debugMode) {
            setDebugInfo(
              (prev) =>
                `${prev || ""}\nError checking balance: ${(balanceError as Error).message}`,
            );
          }
          setErrorInfo(
            `Error checking ticket validity: ${(balanceError as Error).message}`,
          );
          setIsValidTicket(false);
          setNftDetails(null);
          setIsLoading(false);
          return;
        }
      }

      setIsValidTicket(isValid);

      if (isValid) {
        setNftDetails({
          contractName: contractName,
          eventName: eventName,
          keyExpiration: expirationTimestamp,
        });
      } else {
        setNftDetails(null);
      }
    } catch (providerError) {
      console.error("Error initializing provider/contract:", providerError);
      if (debugMode) {
        setDebugInfo(
          (prev) =>
            `${prev || ""}\nProvider/contract error: ${(providerError as Error).message}`,
        );
      }
      setErrorInfo(
        `Error connecting to blockchain: ${(providerError as Error).message}`,
      );
      setIsValidTicket(false);
    } finally {
      setIsLoading(false); // Ensure loading state is always reset
    }
  };

  const handleScan = (address: string) => {
    setWalletAddress(address);
    setShowScanner(false);
    if (debugMode) {
      setDebugInfo(`Successfully extracted address: ${address}`);
    }
    // Reset validation status when scanning a new address
    setIsValidTicket(null);
    setNftDetails(null);
    setErrorInfo(null);
    // Don't automatically validate - let the user click the button
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
    console.log("QR code scanning canceled");
  };

  const handleOpenScanner = () => {
    // Reset any previous errors
    setDebugInfo(null);
    setShowScanner(true);
    console.log("Opening QR code scanner, requesting back camera access...");
  };

  // Function to toggle debug mode
  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
    if (!debugMode) {
      console.log("Debug mode enabled");
    } else {
      setDebugInfo(null);
      console.log("Debug mode disabled");
    }
  };

  return (
    <div className="App">
      <h1>NFT Ticket Validator</h1>

      {showScanner ? (
        <>
          <QRCodeScanner
            onScan={handleScan}
            onClose={handleCloseScanner}
            debug={debugMode}
          />
          <p className="scanner-instructions">
            Point your camera at a Metri wallet QR code to scan the wallet
            address
          </p>
          {debugMode && (
            <p className="debug-note">
              Debug mode is enabled. Raw QR code content will be displayed.
            </p>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="Enter Wallet Address"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className="wallet-input"
          />
          <div className="button-group">
            <button
              onClick={checkTicketValidity}
              disabled={isLoading || !walletAddress} // Disable if loading or no address
              className="validate-button"
            >
              {isLoading ? "Checking..." : "Validate Ticket"}
            </button>
            <button
              onClick={handleOpenScanner}
              disabled={isLoading}
              className="scan-button"
            >
              Scan QR Code
            </button>
            <button
              onClick={() => {
                setWalletAddress("");
                setIsValidTicket(null);
                setNftDetails(null);
                setDebugInfo(null);
                setErrorInfo(null);
              }}
              disabled={isLoading || !walletAddress}
              className="reset-button"
            >
              Reset
            </button>
          </div>
        </>
      )}

      {isLoading && (
        <p className="loading-message">Checking ticket validity...</p>
      )}
      {errorInfo && <p className="error-message">{errorInfo}</p>}
      {isValidTicket === true && <p className="valid">✅ Valid Ticket!</p>}
      {isValidTicket === false && !errorInfo && (
        <p className="invalid">❌ Invalid Ticket!</p>
      )}

      {debugMode && debugInfo && (
        <div className="debug-info">
          <h3>Debug Information</h3>
          <pre>{debugInfo}</pre>
        </div>
      )}

      <div className="info-box">
        <h3>Contract Information</h3>
        <p>NFT Contract: {NFT_CONTRACT_ADDRESS}</p>
        <p className="env-note">
          Using {import.meta.env.VITE_NFT_CONTRACT_ADDRESS}
        </p>

        {nftDetails && (
          <div className="nft-details">
            <h3>NFT Details</h3>
            <p>Contract Name: {nftDetails.contractName}</p>
            <p>Event Name: {nftDetails.eventName}</p>
            {nftDetails.keyExpiration && (
              <p>Key Expires: {nftDetails.keyExpiration}</p>
            )}
          </div>
        )}
      </div>

      <div className="debug-button-container">
        <button
          onClick={toggleDebugMode}
          className={`debug-button ${debugMode ? "active" : ""}`}
        >
          {debugMode ? "Disable Debug" : "Enable Debug"}
        </button>
      </div>
    </div>
  );
}

export default App;
