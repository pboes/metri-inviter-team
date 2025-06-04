import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";
import QRCodeScanner from "./QRCodeScanner";
import { createSafeClient } from "@safe-global/sdk-starter-kit";

// Hardcoded addresses
const GROUP_CONTRACT_ADDRESS = "0xeb614ef61367687704cd4628a68a02f3b10ce68c";
const DEFAULT_SAFE_ADDRESS = "0x0aFd8899bca011Bb95611409f09c8EFbf6b169cF";

// Gnosis Chain configuration
const GNOSIS_CHAIN_ID = 100;
const GNOSIS_RPC_URL = "https://rpc.gnosischain.com";

// Minimal ABI with just what we need
const GROUP_ABI = [
  "function owner() external view returns (address)",
  "function trustBatchWithConditions(address[] memory _coreMembers, uint96 _expiry) external",
];

// Safe ABI (minimal for ownership check)
const SAFE_ABI = [
  "function isOwner(address owner) public view returns (bool)",
  "function getThreshold() public view returns (uint256)",
];

// Define our operating modes
type OperatingMode = "scan-only" | "auto-tally" | "auto-group";
type OwnerMode = "direct" | "safe";

function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  // const [tallyUrl, setTallyUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [scannedAddress, setScannedAddress] = useState<string | null>(null);
  const [mode, setMode] = useState<OperatingMode>("scan-only");
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("direct");
  const [processingGroup, setProcessingGroup] = useState(false);
  const [processingTally, setProcessingTally] = useState(false);
  const [safeAddress, setSafeAddress] = useState(DEFAULT_SAFE_ADDRESS);
  const [isDirectOwner, setIsDirectOwner] = useState(false);
  const [isSafeOwner, setIsSafeOwner] = useState(false);
  const [isSafeGroupOwner, setIsSafeGroupOwner] = useState(false);
  // const [currentNetworkId, setCurrentNetworkId] = useState<number | null>(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [safeThreshold, setSafeThreshold] = useState<number>(1);
  const [safeClient, setSafeClient] = useState<any>(null);
  const [walletEip1193Provider, setWalletEip1193Provider] = useState<any>(null);

  // Set the EIP-1193 provider when window.ethereum is available
  useEffect(() => {
    if (window.ethereum) {
      setWalletEip1193Provider(window.ethereum);
    }
  }, []);

  // Initialize an explicit fallback provider for Gnosis Chain
  useEffect(() => {
    const initFallbackProvider = () => {
      // Create a direct provider to Gnosis Chain
      const fallbackProvider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
      setProvider(fallbackProvider);
      console.log("Using fallback Gnosis Chain provider");
    };

    // Use this as a fallback if MetaMask isn't on Gnosis Chain
    if (!isCorrectNetwork) {
      initFallbackProvider();
    }
  }, [isCorrectNetwork]);

  // Initialize Safe SDK when wallet is connected and on correct network
  useEffect(() => {
    const initSafeClient = async () => {
      if (
        walletConnected &&
        isCorrectNetwork &&
        walletEip1193Provider &&
        ownerMode === "safe"
      ) {
        try {
          // Reset any existing safe client
          setSafeClient(null);

          // Get the connected wallet address
          const connectedAddress = await signer?.getAddress();
          if (!connectedAddress) {
            throw new Error("Could not get connected wallet address");
          }

          setErrorInfo("Initializing Safe client...");
          console.log("Initializing Safe client with:", {
            provider: walletEip1193Provider,
            signer: connectedAddress,
            safeAddress: safeAddress,
          });

          // Create Safe Client with correct parameters
          // provider: window.ethereum (EIP-1193 provider)
          // signer: connected wallet address (as hex string)
          // safeAddress: the Safe address
          const client = await createSafeClient({
            provider: walletEip1193Provider,
            signer: connectedAddress,
            safeAddress: safeAddress,
          });

          setSafeClient(client);
          setErrorInfo(null);
          console.log("Safe client initialized successfully");
        } catch (error) {
          console.error("Failed to initialize Safe client:", error);
          setSafeClient(null);
          setErrorInfo(
            `Failed to initialize Safe client: ${(error as Error).message}`,
          );
        }
      } else {
        setSafeClient(null);
      }
    };

    initSafeClient();
  }, [
    walletConnected,
    isCorrectNetwork,
    signer,
    safeAddress,
    ownerMode,
    walletEip1193Provider,
  ]);

  // Check ownership statuses whenever wallet connection or mode changes
  useEffect(() => {
    if (provider) {
      checkOwnershipStatuses();
    }
  }, [walletConnected, ownerMode, safeAddress, provider]);

  // Function to check all ownership statuses
  const checkOwnershipStatuses = async () => {
    if (!provider) return;

    try {
      // Create contract instance using the fallback provider if needed
      const groupContract = new ethers.Contract(
        GROUP_CONTRACT_ADDRESS,
        GROUP_ABI,
        provider,
      );

      console.log(
        "Attempting to call owner() function on contract:",
        GROUP_CONTRACT_ADDRESS,
      );

      // Try to get the owner with a direct call
      try {
        const ownerAddress = await groupContract.owner();
        console.log("Group owner address:", ownerAddress);

        // If we're using a wallet, check if it's the owner
        if (signer) {
          const connectedAddress = await signer.getAddress();
          setIsDirectOwner(
            ownerAddress.toLowerCase() === connectedAddress.toLowerCase(),
          );
        }

        // Check if Safe is the owner
        setIsSafeGroupOwner(
          ownerAddress.toLowerCase() === safeAddress.toLowerCase(),
        );

        // If we're in Safe mode and have a wallet connected, check Safe ownership
        if (ownerMode === "safe" && signer) {
          try {
            const safeContract = new ethers.Contract(
              safeAddress,
              SAFE_ABI,
              provider,
            );
            const connectedAddress = await signer.getAddress();
            const isOwner = await safeContract.isOwner(connectedAddress);
            setIsSafeOwner(isOwner);

            // Also get the threshold for the Safe
            const threshold = await safeContract.getThreshold();
            setSafeThreshold(Number(threshold));
            console.log("Safe threshold:", threshold.toString());
          } catch (error) {
            console.error("Error checking Safe ownership:", error);
            setIsSafeOwner(false);
          }
        }
      } catch (error) {
        console.error("Error calling owner() function:", error);

        // Fallback: just allow operations based on mode
        setIsDirectOwner(ownerMode === "direct");
        setIsSafeGroupOwner(ownerMode === "safe");
        setIsSafeOwner(ownerMode === "safe");
      }
    } catch (error) {
      console.error("Error in checkOwnershipStatuses:", error);
      // Fallback to allow functionality despite errors
      setIsDirectOwner(ownerMode === "direct");
      setIsSafeGroupOwner(ownerMode === "safe");
      setIsSafeOwner(ownerMode === "safe");
    }
  };

  // Check network and setup wallet connection
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (window.ethereum) {
        try {
          // Check the current network first
          const chainId = await window.ethereum.request({
            method: "eth_chainId",
          });
          const networkId = parseInt(chainId, 16);
          // setCurrentNetworkId(networkId);
          setIsCorrectNetwork(networkId === GNOSIS_CHAIN_ID);

          // Setup provider based on network
          let ethersProvider;
          if (networkId === GNOSIS_CHAIN_ID) {
            // Use MetaMask provider if on Gnosis Chain
            ethersProvider = new ethers.BrowserProvider(window.ethereum);
          } else {
            // Use direct RPC provider if on wrong network
            ethersProvider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
            console.warn(
              "Wallet is connected to the wrong network. Using direct Gnosis Chain provider for read operations.",
            );
          }

          setProvider(ethersProvider);

          // Check if already connected
          const accounts = await window.ethereum.request({
            method: "eth_accounts",
          });
          if (accounts.length > 0) {
            // Only setup signer if on correct network
            if (networkId === GNOSIS_CHAIN_ID) {
              const ethersSigner = await ethersProvider.getSigner();
              setSigner(ethersSigner);
            }
            setWalletConnected(true);
          }

          // Listen for network changes
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

  // Function to switch to Gnosis Chain
  const switchToGnosisChain = async () => {
    if (!window.ethereum) return;

    try {
      // Try to switch to Gnosis Chain
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x64" }], // 100 in hex
      });
    } catch (switchError: any) {
      // If the chain hasn't been added to MetaMask, add it
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
          setErrorInfo(
            "Failed to add Gnosis Chain to your wallet. Please add it manually.",
          );
        }
      } else {
        console.error("Failed to switch to Gnosis Chain:", switchError);
        setErrorInfo(
          "Failed to switch to Gnosis Chain. Please switch manually.",
        );
      }
    }
  };

  // Function to connect wallet
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

      // Request account access
      await window.ethereum.request({ method: "eth_requestAccounts" });

      // Check network and prompt to switch if needed
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      const networkId = parseInt(chainId, 16);

      if (networkId !== GNOSIS_CHAIN_ID) {
        setErrorInfo("Please switch to Gnosis Chain to use this app.");
        await switchToGnosisChain();
        return;
      }

      // Setup provider and signer
      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(ethersProvider);

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

  // Function to create Tally URL and open it
  const createTallyUrl = (address: string) => {
    setProcessingTally(true);

    try {
      const baseUrl = "https://tally.so/r/wv1k10";
      const fullUrl = `${baseUrl}?address=${encodeURIComponent(address)}`;
      // setTallyUrl(fullUrl);

      // Open the URL in a new tab
      window.open(fullUrl, "_blank");

      return fullUrl;
    } catch (error) {
      setErrorInfo(`Error creating Tally URL: ${(error as Error).message}`);
      return null;
    } finally {
      setProcessingTally(false);
    }
  };

  // Function to add address to group directly
  const addToGroupDirect = async (address: string) => {
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
      setProcessingGroup(true);

      // Create contract instance
      const groupContract = new ethers.Contract(
        GROUP_CONTRACT_ADDRESS,
        GROUP_ABI,
        signer,
      );

      // Format parameters for trustBatchWithConditions
      const addresses = [address]; // Array with single address
      const expiry = 9999999999; // Far future expiry

      // Call the contract function
      const tx = await groupContract.trustBatchWithConditions(
        addresses,
        expiry,
      );

      // Wait for transaction to be mined
      await tx.wait();

      setTxHash(tx.hash);
    } catch (error) {
      console.error("Error adding to group:", error);
      setErrorInfo(`Failed to add to group: ${(error as Error).message}`);
    } finally {
      setProcessingGroup(false);
    }
  };

  // Function to add address to group via Safe using the SDK Starter Kit
  const addToGroupViaSafe = async (address: string) => {
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

    if (!safeClient) {
      setErrorInfo("Safe client not initialized. Please try again.");
      return;
    }

    try {
      setProcessingGroup(true);
      setErrorInfo("Creating Safe transaction...");

      // Create the transaction data for the group contract call
      const groupInterface = new ethers.Interface(GROUP_ABI);
      const addresses = [address]; // Array with single address
      const expiry = 9999999999; // Far future expiry

      // Create the encoded function call
      const txData = groupInterface.encodeFunctionData(
        "trustBatchWithConditions",
        [addresses, expiry],
      );

      // Create the transaction object for the Safe SDK
      const transactions = [
        {
          to: GROUP_CONTRACT_ADDRESS,
          data: txData,
          value: "0",
        },
      ];

      // Use the Safe client to send the transaction
      setErrorInfo("Sending Safe transaction...");
      console.log("Sending transaction:", transactions);

      // Execute the transaction
      const txResult = await safeClient.send({ transactions });
      console.log("Transaction result:", txResult);

      // For threshold=1, the transaction should be executed immediately
      if (txResult.transaction?.transactionHash) {
        setTxHash(txResult.transaction.transactionHash);
        setErrorInfo(null);
      }
      // For threshold>1, we'll get a safeTxHash but no transactionHash yet
      else if (txResult.transaction?.safeTxHash) {
        setTxHash(null);
        setErrorInfo(
          `Transaction created with Safe TX hash: ${txResult.transaction.safeTxHash}. This Safe requires ${safeThreshold} signatures. Please use the Safe web app to execute it once all signatures are collected.`,
        );

        // Open the Safe web app for the user to view and manage the transaction
        window.open(
          `https://app.safe.global/transactions/queue?safe=gno:${safeAddress}`,
          "_blank",
        );
      } else {
        setErrorInfo(
          "Transaction created but no transaction hash returned. Check the Safe transaction service for status.",
        );
      }
    } catch (error) {
      console.error("Error creating/executing Safe transaction:", error);

      // Provide more detailed error information based on the type of error
      if (typeof error === "object" && error !== null) {
        const errorObj = error as any;
        if (errorObj.reason) {
          setErrorInfo(`Transaction error: ${errorObj.reason}`);
        } else if (errorObj.message) {
          setErrorInfo(
            `Failed to execute Safe transaction: ${errorObj.message}`,
          );
        } else {
          setErrorInfo(
            `Failed to execute Safe transaction: ${JSON.stringify(error)}`,
          );
        }
      } else {
        setErrorInfo(`Failed to execute Safe transaction: ${String(error)}`);
      }
    } finally {
      setProcessingGroup(false);
    }
  };

  // Main function to add address to group (routes to the appropriate method)
  const addToGroup = async (address: string) => {
    if (ownerMode === "direct") {
      await addToGroupDirect(address);
    } else {
      await addToGroupViaSafe(address);
    }
  };

  // Function to handle QR code scan result
  const handleScan = (address: string) => {
    setScannedAddress(address);
    setWalletAddress(address);
    setShowScanner(false);
    setErrorInfo(null);

    // Auto-execute based on mode
    if (mode === "auto-tally") {
      createTallyUrl(address);
    } else if (mode === "auto-group" && walletConnected && isCorrectNetwork) {
      addToGroup(address);
    }
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  const handleOpenScanner = () => {
    // Reset any previous errors and data
    setErrorInfo(null);
    // setTallyUrl(null);
    setTxHash(null);
    setScannedAddress(null);
    setShowScanner(true);
  };

  // Function to update address field and set as current address
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWalletAddress(value);

    // If the value is a valid Ethereum address, set it as the scanned address
    if (/^0x[a-fA-F0-9]{40}$/i.test(value)) {
      setScannedAddress(value);
    } else if (value === "") {
      // Clear scanned address if input is empty
      setScannedAddress(null);
    }
  };

  // Function to update Safe address
  const handleSafeAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSafeAddress(value);
    // Reset Safe client when changing address
    setSafeClient(null);
  };

  // Get current status text based on ownership status
  const getOwnershipStatusText = () => {
    if (!walletConnected) {
      return "Connect wallet to check ownership status";
    }

    if (!isCorrectNetwork) {
      return "Please switch to Gnosis Chain for full functionality";
    }

    if (ownerMode === "direct") {
      return isDirectOwner
        ? "✓ Your wallet is the group owner"
        : "⚠️ Your wallet may not be the group owner";
    } else {
      // Safe mode
      if (!safeClient) {
        return "⚠️ Safe client not initialized";
      }

      if (!isSafeGroupOwner) {
        return "⚠️ The Safe may not be the group owner";
      }

      if (!isSafeOwner) {
        return "⚠️ You may not be an owner of the Safe";
      }

      return `✓ Safe ownership confirmed (Threshold: ${safeThreshold})`;
    }
  };

  // Check if user can add to group based on current ownership status
  const canAddToGroup = () => {
    if (!walletConnected) return false;
    if (!isCorrectNetwork) return false;

    if (ownerMode === "safe") {
      return !!safeClient && isSafeOwner && isSafeGroupOwner;
    }

    return true;
  };

  return (
    <div className="App">
      <h1>Metri Wallet Connector</h1>

      {/* Network Status */}
      {walletConnected && !isCorrectNetwork && (
        <div className="network-warning mb-6">
          <p>⚠️ Your wallet is not connected to Gnosis Chain</p>
          <button
            onClick={switchToGnosisChain}
            className="switch-network-button mt-2"
          >
            Switch to Gnosis Chain
          </button>
        </div>
      )}

      {/* Owner Mode Toggle */}
      <div className="owner-mode-toggle mb-6">
        <h2 className="text-xl mb-4">Owner Type</h2>
        <div className="flex justify-center gap-4">
          <button
            className={`mode-button ${ownerMode === "direct" ? "active" : ""}`}
            onClick={() => setOwnerMode("direct")}
          >
            Direct Owner
          </button>
          <button
            className={`mode-button ${ownerMode === "safe" ? "active" : ""}`}
            onClick={() => setOwnerMode("safe")}
          >
            Safe Owner
          </button>
        </div>
      </div>

      {/* Safe Address Input (only visible in Safe mode) */}
      {ownerMode === "safe" && (
        <div className="safe-address-container mb-6">
          <input
            type="text"
            placeholder="Safe Address (0x...)"
            value={safeAddress}
            onChange={handleSafeAddressChange}
            className="wallet-input"
          />
          {walletConnected && isCorrectNetwork && (
            <p className="text-sm text-center mt-2">
              {safeClient
                ? "✓ Safe client initialized"
                : "⚠️ Safe client not initialized"}
            </p>
          )}
        </div>
      )}

      {/* Ownership Status */}
      {walletConnected && (
        <div
          className={`ownership-status mb-6 ${
            !isCorrectNetwork
              ? "warning"
              : canAddToGroup()
                ? "success"
                : "error"
          }`}
        >
          {getOwnershipStatusText()}
        </div>
      )}

      {/* Mode Selection - Simplified to 3 options */}
      <div className="mode-selection mb-6">
        <h2 className="text-xl mb-4">Action Mode</h2>
        <div className="flex justify-center gap-4">
          <button
            className={`mode-button ${mode === "scan-only" ? "active" : ""}`}
            onClick={() => setMode("scan-only")}
          >
            Scan Only
          </button>
          <button
            className={`mode-button ${mode === "auto-tally" ? "active" : ""}`}
            onClick={() => setMode("auto-tally")}
          >
            Auto-Tally
          </button>
          <button
            className={`mode-button ${mode === "auto-group" ? "active" : ""}`}
            onClick={() => setMode("auto-group")}
          >
            Auto-Group
          </button>
        </div>
      </div>

      {/* Wallet Connection - Always Visible */}
      <div className="wallet-connection mb-6">
        {walletConnected ? (
          <div className="text-center">
            <p className="text-green-600 font-bold">✓ Wallet Connected</p>
            <p className="text-sm text-gray-600">
              {isCorrectNetwork
                ? "Connected to Gnosis Chain"
                : "Not connected to Gnosis Chain"}
            </p>
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

      {showScanner ? (
        <>
          <QRCodeScanner
            onScan={handleScan}
            onClose={handleCloseScanner}
            debug={false}
          />
          <p className="scanner-instructions">
            Point your camera at a Metri wallet QR code to scan the wallet
            address
          </p>
        </>
      ) : (
        <>
          <div className="mb-8">
            <button onClick={handleOpenScanner} className="scan-button">
              Scan QR Code
            </button>
          </div>

          <div className="mt-6 pb-6 border-b border-gray-300">
            <input
              type="text"
              placeholder="Enter Wallet Address (0x...)"
              value={walletAddress}
              onChange={handleAddressChange}
              className="wallet-input"
            />
          </div>
        </>
      )}

      {errorInfo && <p className="error-message">{errorInfo}</p>}

      {/* Display address and action buttons (always visible when address is available) */}
      {scannedAddress && (
        <div className="address-display mt-6">
          <h3>Wallet Address</h3>
          <p className="break-all">{scannedAddress}</p>

          <div className="action-buttons-container mt-4">
            <button
              onClick={() => createTallyUrl(scannedAddress)}
              className="action-button tally-button"
              disabled={processingTally}
            >
              {processingTally ? "Opening..." : "Open Tally Form"}
            </button>

            <button
              onClick={() => addToGroup(scannedAddress)}
              disabled={
                !walletConnected ||
                processingGroup ||
                !isCorrectNetwork ||
                (ownerMode === "safe" && !safeClient)
              }
              className="action-button group-button"
            >
              {processingGroup
                ? "Processing..."
                : ownerMode === "direct"
                  ? "Add to Group"
                  : "Add via Safe"}
            </button>
          </div>
        </div>
      )}

      {/* Transaction success message */}
      {txHash && (
        <div className="success-box mt-4">
          <h3>✅ Address Added to Group</h3>
          <p>Transaction Hash:</p>
          <p className="break-all text-xs">{txHash}</p>
          <a
            href={`https://gnosisscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="view-tx-button mt-4"
          >
            View Transaction
          </a>
        </div>
      )}
    </div>
  );
}

export default App;
