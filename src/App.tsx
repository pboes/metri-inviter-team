import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";
import QRCodeScanner from "./QRCodeScanner";
import { createSafeClient } from "@safe-global/sdk-starter-kit";

// Define group structure with owner property
interface Group {
  id: string;
  name: string;
  address: string;
  owner?: string;
}

// Gnosis Chain configuration
const GNOSIS_CHAIN_ID = 100;
const GNOSIS_RPC_URL = "https://rpc.aboutcircles.com";
const DEFAULT_SAFE_ADDRESS =
  "0x0aFd8899bca011Bb95611409f09c8EFbf6b169cF".toLowerCase();

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
type Tab = "invite" | "group";
type OwnerMode = "direct" | "safe";

function App() {
  // Basic state
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [scannedAddress, setScannedAddress] = useState<string | null>(null);
  const [contextInput, setContextInput] = useState("");

  // Tab and mode states
  const [activeTab, setActiveTab] = useState<Tab>("invite");
  const [autoInvite, setAutoInvite] = useState(false);
  const [autoGroup, setAutoGroup] = useState(false);

  // Group and ownership states
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("direct");
  const [processingGroup, setProcessingGroup] = useState(false);
  const [processingTally, setProcessingTally] = useState(false);
  const [safeAddress, setSafeAddress] = useState(DEFAULT_SAFE_ADDRESS);
  const [isDirectOwner, setIsDirectOwner] = useState(false);
  const [isSafeOwner, setIsSafeOwner] = useState(false);
  const [isSafeGroupOwner, setIsSafeGroupOwner] = useState(false);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [safeThreshold, setSafeThreshold] = useState<number>(1);

  // Safe client
  const [safeClient, setSafeClient] = useState<any>(null);
  const [walletEip1193Provider, setWalletEip1193Provider] = useState<any>(null);

  // Set the EIP-1193 provider when window.ethereum is available
  useEffect(() => {
    if (window.ethereum) {
      setWalletEip1193Provider(window.ethereum);
    }
  }, []);

  // Initialize RPC provider regardless of wallet connection
  useEffect(() => {
    const initRpcProvider = () => {
      const rpcProvider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
      setProvider(rpcProvider);
      return rpcProvider;
    };

    // Initialize provider and fetch groups
    const provider = initRpcProvider();
    fetchGroupsData(provider);
  }, []);

  // Function to fetch trusted groups from the RPC
  const fetchTrustedGroups = async (trusterAddress: string) => {
    const rpcEndpoint = GNOSIS_RPC_URL;
    const requestBody = {
      jsonrpc: "2.0",
      id: 1,
      method: "circles_query",
      params: [
        {
          Namespace: "V_CrcV2",
          Table: "TrustRelations",
          Columns: [],
          Filter: [
            {
              Type: "FilterPredicate",
              FilterType: "Equals",
              Column: "truster",
              Value: trusterAddress,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(rpcEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      // Extract unique trustee addresses from the rows (trustee is at index 5)
      const addresses = new Set(data.result.rows.map((row: any[]) => row[5]));
      return Array.from(addresses) as string[];
    } catch (error) {
      console.error("Error fetching trusted groups:", error);
      return [];
    }
  };

  // Function to get profile name from Circles API
  const getProfileName = async (address: string): Promise<string> => {
    try {
      const queryAddress = address.toLowerCase();
      const url = `https://rpc.aboutcircles.com/profiles/search?address=${queryAddress}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.error("HTTP error", response.status, response.statusText);
        return "Unnamed Group";
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        const profile = data.find(
          (entry) => entry.address.toLowerCase() === queryAddress,
        );
        return profile?.name || "Unnamed Group";
      }
      return "Unnamed Group";
    } catch (error) {
      console.error("Error fetching profile for", address, error);
      return "Unnamed Group";
    }
  };

  // Function to get owner address from group contract
  const getGroupOwner = async (
    groupAddress: string,
    rpcProvider: ethers.Provider,
  ): Promise<string> => {
    try {
      const groupContract = new ethers.Contract(
        groupAddress,
        GROUP_ABI,
        rpcProvider,
      );

      const ownerAddress = await groupContract.owner();
      return ownerAddress;
    } catch (error) {
      console.error("Error getting group owner:", error);
      return DEFAULT_SAFE_ADDRESS; // Fallback to default Safe address
    }
  };

  // Fetch all groups data
  const fetchGroupsData = async (rpcProvider: ethers.Provider) => {
    setLoadingGroups(true);
    try {
      // Fetch trusted groups from the truster (Circles organization)
      const trustedGroups = await fetchTrustedGroups(DEFAULT_SAFE_ADDRESS);

      // Filter out the backers group address (case insensitive)
      const filteredGroups = trustedGroups.filter(
        (address) =>
          address.toLowerCase() !==
          "0x1aca75e38263c79d9d4f10df0635cc6fcfe6f026",
      );

      if (filteredGroups.length === 0) {
        // If no trusted groups found, add a fallback group
        setAvailableGroups([
          {
            id: "default-group",
            name: "Default Circles Group",
            address: "0xeb614ef61367687704cd4628a68a02f3b10ce68c",
            owner: DEFAULT_SAFE_ADDRESS,
          },
        ]);
        setSelectedGroup({
          id: "default-group",
          name: "Default Circles Group",
          address: "0xeb614ef61367687704cd4628a68a02f3b10ce68c",
          owner: DEFAULT_SAFE_ADDRESS,
        });
        return;
      }

      // Process each group to get name and owner
      const groupsWithDetails = await Promise.all(
        filteredGroups.map(async (address, index) => {
          // Get the group owner
          const owner = await getGroupOwner(address, rpcProvider);

          // Get the group name from profile
          const name = await getProfileName(address);

          return {
            id: `group-${index}`,
            name: name || `Group ${index + 1}`,
            address: address,
            owner: owner,
          };
        }),
      );

      setAvailableGroups(groupsWithDetails);

      // Set the first group as selected by default
      if (groupsWithDetails.length > 0) {
        setSelectedGroup(groupsWithDetails[0]);
        setSafeAddress(groupsWithDetails[0].owner || DEFAULT_SAFE_ADDRESS);
      }
    } catch (error) {
      console.error("Error fetching groups data:", error);
      // Set fallback group
      setAvailableGroups([
        {
          id: "default-group",
          name: "Default Circles Group",
          address: "0xeb614ef61367687704cd4628a68a02f3b10ce68c",
          owner: DEFAULT_SAFE_ADDRESS,
        },
      ]);
      setSelectedGroup({
        id: "default-group",
        name: "Default Circles Group",
        address: "0xeb614ef61367687704cd4628a68a02f3b10ce68c",
        owner: DEFAULT_SAFE_ADDRESS,
      });
    } finally {
      setLoadingGroups(false);
    }
  };

  // Initialize Safe SDK when wallet is connected and on correct network
  useEffect(() => {
    const initSafeClient = async () => {
      if (
        walletConnected &&
        isCorrectNetwork &&
        walletEip1193Provider &&
        ownerMode === "safe" &&
        !safeClient // Only initialize if not already initialized
      ) {
        try {
          // Get the connected wallet address
          const connectedAddress = await signer?.getAddress();
          if (!connectedAddress) {
            throw new Error("Could not get connected wallet address");
          }

          // Create Safe Client with correct parameters
          const client = await createSafeClient({
            provider: walletEip1193Provider,
            signer: connectedAddress,
            safeAddress: safeAddress,
          });

          setSafeClient(client);
          setErrorInfo(null);
        } catch (error) {
          console.error("Failed to initialize Safe client:", error);
          setSafeClient(null);
          setErrorInfo(
            `Failed to initialize Safe client: ${(error as Error).message}`,
          );
        }
      }
    };

    if (ownerMode === "safe") {
      initSafeClient();
    }
  }, [
    walletConnected,
    isCorrectNetwork,
    signer,
    safeAddress,
    ownerMode,
    walletEip1193Provider,
    safeClient,
  ]);

  // Update Safe address when group changes (if it has an owner)
  useEffect(() => {
    if (selectedGroup && selectedGroup.owner) {
      setSafeAddress(selectedGroup.owner);
    }
  }, [selectedGroup]);

  // Check ownership statuses whenever selected group, wallet connection or mode changes
  useEffect(() => {
    if (provider && selectedGroup) {
      checkOwnershipStatuses();
    }
  }, [walletConnected, ownerMode, safeAddress, provider, selectedGroup]);

  // Function to check all ownership statuses
  const checkOwnershipStatuses = async () => {
    if (!provider || !selectedGroup) return;

    try {
      // Create contract instance using the fallback provider if needed
      const groupContract = new ethers.Contract(
        selectedGroup.address,
        GROUP_ABI,
        provider,
      );

      // Try to get the owner with a direct call
      try {
        const ownerAddress = await groupContract.owner();

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
          setIsCorrectNetwork(networkId === GNOSIS_CHAIN_ID);

          // Setup provider based on network
          let ethersProvider;
          if (networkId === GNOSIS_CHAIN_ID) {
            // Use MetaMask provider if on Gnosis Chain
            ethersProvider = new ethers.BrowserProvider(window.ethereum);
          } else {
            // Use direct RPC provider if on wrong network
            ethersProvider = new ethers.JsonRpcProvider(GNOSIS_RPC_URL);
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
        }
      } else {
        console.error("Failed to switch to Gnosis Chain:", switchError);
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
      // Include the context parameter if it's not empty
      const contextParam = contextInput
        ? `&context=${encodeURIComponent(contextInput)}`
        : "";
      const fullUrl = `${baseUrl}?address=${encodeURIComponent(address)}${contextParam}`;

      // Always open the URL in a new tab when the button is clicked
      window.open(fullUrl, "_blank");

      return fullUrl;
    } catch (error) {
      setErrorInfo(`Error creating Tally URL: ${(error as Error).message}`);
      return null;
    } finally {
      setProcessingTally(false);
    }
  };

  // Add a handler for the context input
  const handleContextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContextInput(e.target.value);
  };

  // Function to add address to group directly
  const addToGroupDirect = async (address: string) => {
    if (!selectedGroup) return;

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
        selectedGroup.address,
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
    if (!selectedGroup) return;

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
          to: selectedGroup.address,
          data: txData,
          value: "0",
        },
      ];

      // Execute the transaction
      const txResult = await safeClient.send({ transactions });

      // For threshold=1, the transaction should be executed immediately
      if (txResult.transaction?.transactionHash) {
        setTxHash(txResult.transaction.transactionHash);
        setErrorInfo(null);
      }
      // For threshold>1, we'll get a safeTxHash but no transactionHash yet
      else if (txResult.transaction?.safeTxHash) {
        setTxHash(null);
        setErrorInfo(
          `Transaction created with Safe TX hash: ${txResult.transaction.safeTxHash}. This Safe requires ${safeThreshold} signatures.`,
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

    // Auto-execute based on active tab and its toggle
    if (activeTab === "invite" && autoInvite) {
      createTallyUrl(address);
    } else if (activeTab === "group" && autoGroup && canAddToGroup()) {
      addToGroup(address);
    }
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  const handleOpenScanner = () => {
    // Reset any previous errors and data
    setErrorInfo(null);
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

  // Handle group selection change
  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const group = availableGroups.find((g) => g.id === selectedId);
    if (group) {
      setSelectedGroup(group);
    }
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
    if (!selectedGroup) return false;

    if (ownerMode === "safe") {
      return !!safeClient && isSafeOwner && isSafeGroupOwner;
    }

    return true;
  };

  // Render the Invite Tab Content
  const renderInviteTab = () => {
    return (
      <div className="tab-content">
        <div className="input-container">
          <input
            type="text"
            placeholder="Context (optional)"
            value={contextInput}
            onChange={handleContextChange}
            className="wallet-input"
          />
        </div>

        <div className="auto-toggle-container">
          <div className="auto-execute-toggle">
            <span className="toggle-label">Auto-Invite:</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoInvite}
                onChange={() => setAutoInvite(!autoInvite)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {scannedAddress && (
          <div className="address-display">
            <div className="action-buttons-container">
              <button
                onClick={() => createTallyUrl(scannedAddress)}
                className="action-button tally-button"
                disabled={processingTally}
              >
                {processingTally ? "Opening..." : "Open Invitation Form"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render the Group Tab Content
  const renderGroupTab = () => {
    return (
      <div className="tab-content">
        {/* Group Selection Dropdown */}
        <div className="group-selection-container">
          {loadingGroups ? (
            <div className="loading-indicator">Loading groups...</div>
          ) : (
            <select
              id="group-select"
              value={selectedGroup?.id || ""}
              onChange={handleGroupChange}
              className="group-select-dropdown"
              disabled={loadingGroups}
            >
              {availableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.address.substring(0, 6)}...
                  {group.address.substring(38)})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Ownership Status */}
        {walletConnected && (
          <div
            className={`ownership-status ${
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

        {/* Owner Mode Toggle */}
        <div className="owner-mode-toggle">
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

        {/* Wallet Connection Section */}
        <div className="wallet-connection">
          {walletConnected ? (
            <div className="text-center">
              <p className="text-green-600 font-bold">✓ Wallet Connected</p>
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

        {/* Auto-Group Toggle */}
        <div className="auto-toggle-container">
          <div className="auto-execute-toggle">
            <span className="toggle-label">Auto-Add to Group:</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoGroup}
                onChange={() => setAutoGroup(!autoGroup)}
                disabled={!canAddToGroup()}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* Network Warning - only show if on wrong network */}
        {walletConnected && !isCorrectNetwork && (
          <div className="network-warning">
            <button
              onClick={switchToGnosisChain}
              className="switch-network-button"
            >
              Switch to Gnosis Chain
            </button>
          </div>
        )}
        {/* Display address and action buttons */}
        {scannedAddress && (
          <div className="address-display">
            <div className="action-buttons-container">
              <button
                onClick={() => addToGroup(scannedAddress)}
                disabled={
                  !walletConnected ||
                  processingGroup ||
                  !isCorrectNetwork ||
                  (ownerMode === "safe" && !safeClient) ||
                  !selectedGroup
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
          <div className="success-box">
            <h3>✅ Address Added to Group</h3>
            <p className="break-all text-xs">{txHash}</p>
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
    );
  };

  return (
    <div className="App">
      <h1>Circles Onboarding Helper</h1>

      {/* Main scan button - always visible at the top */}
      <div className="scan-button-container">
        <button onClick={handleOpenScanner} className="scan-button">
          Scan QR Code
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <div className="flex border-b">
          <button
            className={`tab-button ${activeTab === "invite" ? "active" : ""}`}
            onClick={() => setActiveTab("invite")}
          >
            Invite
          </button>
          <button
            className={`tab-button ${activeTab === "group" ? "active" : ""}`}
            onClick={() => setActiveTab("group")}
          >
            Add to Group
          </button>
        </div>
      </div>

      {/* QR Scanner or Manual Input */}
      {showScanner ? (
        <QRCodeScanner
          onScan={handleScan}
          onClose={handleCloseScanner}
          debug={false}
        />
      ) : (
        <>
          {/* Manual address input field */}
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter Wallet Address (0x...)"
              value={walletAddress}
              onChange={handleAddressChange}
              className="wallet-input"
            />
          </div>

          {/* Display any errors */}
          {errorInfo && <p className="error-message">{errorInfo}</p>}

          {/* Render active tab content */}
          {activeTab === "invite" ? renderInviteTab() : renderGroupTab()}
        </>
      )}
    </div>
  );
}

export default App;
