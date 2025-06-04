# Circles Onboarding Helper

A streamlined tool for onboarding new users to the Circles UBI ecosystem. This application allows organizers to easily scan Circles wallet QR codes and perform two critical actions:

1. **Invite users** to join the Circles ecosystem by sending them a personalized invitation form
2. **Add users to groups** by creating blockchain transactions that establish trust relationships

## Features

- **QR Code Scanning**: Quickly scan wallet QR codes using a device camera
- **Manual Address Entry**: Enter wallet addresses manually when QR codes aren't available
- **Dual Functionality**: Switch between invitation and group addition workflows
- **Dynamic Group Selection**: Choose from available Circles groups with names automatically fetched from profiles
- **Auto-Mode**: Set up automatic actions after scanning for faster processing
- **Direct & Safe Transactions**: Support for both direct wallet transactions and Safe multi-signature wallets
- **Network Detection**: Automatic detection of Gnosis Chain connection with easy network switching

## How It Works

### Invitation Flow

1. Scan a QR code or enter a wallet address
2. Toggle "Auto-Invite" to control whether invitations are sent automatically after scanning
3. Click "Open Invitation Form" to open a pre-filled invitation form in a new tab
4. The form includes the scanned/entered wallet address for seamless onboarding

### Group Addition Flow

1. Scan a QR code or enter a wallet address
2. Select the target Circles group from the dropdown
3. Choose between direct wallet transactions or Safe multi-signature transactions
4. Connect your wallet (if not already connected)
5. Toggle "Auto-Add to Group" to enable automatic transactions after scanning
6. Click "Add to Group" to create a blockchain transaction that establishes trust
7. View transaction details and access block explorer links for completed transactions

## Technical Details

- Built with React, TypeScript, and Ethers.js
- Connects to the Gnosis Chain (formerly xDai) blockchain
- Interacts with Circles smart contracts for group trust relationships
- Fetches group data dynamically from the Circles RPC API
- Retrieves profile names from the Circles profiles service
- Supports Safe multi-signature wallet integration via the Safe SDK

## Security & Permissions

- Requires wallet connection for group transactions
- Auto-detects wallet connection status and permissions
- Validates ownership status before allowing group modifications
- Shows clear status messages indicating transaction requirements and permissions

## Usage Scenarios

### Event Onboarding

At community events, organizers can quickly scan attendees' wallet QR codes and send them personalized invitation forms or immediately add them to community groups.

### Remote Assistance

Support personnel can ask users to share their wallet addresses and easily help them join appropriate groups without complex technical instructions.

### Community Building

Group administrators can efficiently manage group membership by scanning wallet codes and adding new members to their communities with minimal effort.

## Network Information

This application is designed to work with the Gnosis Chain (Chain ID: 100), which is the home network for the Circles ecosystem. All transactions are created and executed on this network.

## Privacy Considerations

This application doesn't store any wallet addresses or transaction data. All interactions with the blockchain are performed directly from the user's device and wallet.
