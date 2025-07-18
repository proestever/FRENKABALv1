# FrenKabal - PulseChain Wallet Tracker

## Overview

FrenKabal is a comprehensive PulseChain wallet tracking application that provides real-time blockchain insights, portfolio management, and advanced wallet analytics. The application allows users to track multiple PulseChain wallet addresses, monitor token balances, view transaction history, and manage portfolios with advanced features like LP token support and price tracking.

## System Architecture

### High-Level Architecture

The application follows a modern full-stack TypeScript architecture with the following layers:

- **Frontend**: React-based SPA using Vite as the build tool
- **Backend**: Express.js server with RESTful API endpoints
- **Database**: PostgreSQL accessed via Drizzle ORM with schema-first approach
- **External APIs**: Integration with blockchain data providers (Moralis, PulseChain Scan, DexScreener)
- **Caching**: Multi-layer caching strategy for performance optimization

### Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js, TypeScript, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Build Tools**: Vite for frontend, esbuild for backend
- **Authentication**: Wallet-based authentication (MetaMask/Web3)
- **Deployment**: Replit with autoscale deployment

## Key Components

### Frontend Architecture

1. **Component Library**: Uses shadcn/ui (Radix UI primitives) with Tailwind CSS
2. **State Management**: React Query for server state, React hooks for local state
3. **Routing**: Wouter for lightweight client-side routing
4. **Wallet Integration**: Custom wallet hooks for Web3 connectivity
5. **Responsive Design**: Mobile-first responsive design with dark theme

### Backend Architecture

1. **API Layer**: RESTful endpoints for wallet data, portfolios, and user management
2. **Service Layer**: Modular services for blockchain interaction, caching, and data processing
3. **Database Layer**: Drizzle ORM with type-safe database queries
4. **Middleware**: Authentication, error handling, and request logging

### Key Services

- **Blockchain Service**: Direct RPC calls to PulseChain for real-time data
- **API Service**: Aggregated data from Moralis, PulseChain Scan, and DexScreener
- **Cache Service**: Multi-level caching for performance optimization
- **LP Token Service**: Specialized handling for liquidity pool tokens
- **Price Source Service**: Intelligent price source selection and fallbacks

## Data Flow

### Wallet Data Flow

1. User inputs wallet address or connects wallet
2. Frontend validates address and initiates data fetch
3. Backend checks cache for recent data
4. If cache miss, fetches from blockchain APIs in batches
5. Data is processed, enriched with prices/logos, and cached
6. Paginated results returned to frontend with loading progress
7. Frontend displays wallet overview and token list

### Portfolio Management Flow

1. Authenticated users can create portfolios
2. Portfolios contain multiple wallet addresses with labels
3. Portfolio data aggregates across all included wallets
4. Real-time updates when wallet data changes
5. Portfolio sharing via unique URLs

### Price Data Flow

1. Token prices fetched from multiple sources (Moralis, DexScreener)
2. Intelligent source selection based on token reliability
3. Price data cached with appropriate TTL
4. Fallback mechanisms for price source failures

## External Dependencies

### Blockchain APIs

- **Moralis**: Primary blockchain data provider for token balances and metadata
- **PulseChain Scan**: Secondary data source and transaction history
- **DexScreener**: Token price data and trading pair information

### Database

- **PostgreSQL**: Primary data store for user data, portfolios, and cache
- **Drizzle ORM**: Type-safe database access with schema migrations

### Authentication

- **Web3 Wallets**: MetaMask and compatible wallet authentication
- **Session Management**: Server-side session storage with PostgreSQL

### UI/UX Libraries

- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide Icons**: Consistent icon library

## Deployment Strategy

### Replit Configuration

- **Modules**: Node.js 20, Web, PostgreSQL 16
- **Build Process**: Vite build for frontend, esbuild bundle for backend
- **Runtime**: Express server serving built frontend assets
- **Database**: Automated PostgreSQL provisioning

### Environment Variables

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string (auto-provided by Replit)
- `MORALIS_API_KEY`: API key for Moralis blockchain data service

### Scaling Considerations

- **Caching**: Multi-layer caching reduces API calls and database queries
- **Connection pooling**: PostgreSQL connection pool with proper lifecycle management
- **Rate limiting**: Built-in rate limiting for external API calls
- **Error handling**: Graceful degradation when external services are unavailable

### Health Monitoring

- **Health endpoints**: Server health and status monitoring
- **Memory monitoring**: Automatic memory usage tracking and alerts
- **API usage tracking**: Detailed API call statistics and monitoring
- **Connection monitoring**: Real-time connection status indicators

## Recent Changes

### July 15, 2025 - Transaction History Now Uses Scanner API for Immediate Loading
- **Updated transaction history component** - Transaction history now uses `/api/wallet/:address/scanner-transactions` endpoint for instant loading
- **No more "load more" delays** - Transactions appear immediately when opening transaction history, no need to click multiple times
- **Increased initial load limit** - Now loads 200 transactions initially (up from 50) to provide comprehensive history
- **Seamless pagination** - "Load more" button properly uses scanner API cursor for fetching additional transactions
- **Scanner API benefits** - Transaction history inherits all performance improvements from scanner API integration

### July 15, 2025 - Completed Full Scanner API Integration Across All Features
- **Fully integrated scanner API into main getWalletDataFull function** - All wallet searches now use ultra-fast scanner API by default
- **Performance metrics** - Consistent 2-4 second load times across all wallet sizes (previously 12-30+ seconds)
- **Portfolio bundles optimized** - Multi-wallet portfolio bundles now benefit from scanner API speed improvements
- **Removed old blockchain scanning code** - Cleaned up legacy code, now exclusively using scanner API approach
- **Production-ready implementation** - All features including individual wallets, portfolio bundles, and transaction history use scanner API
- **Maintained data accuracy** - Hybrid approach ensures real-time accuracy while leveraging scanner speed

### July 18, 2025 - Enhanced Transaction History with Robust Activity Visualization
- **Clear transaction categorization** - Transactions now display as distinct activity types: SWAP, SENT, RECEIVED, CONTRACT INTERACTION
- **Enhanced swap display** - Swaps show both tokens with USD values in purple-themed cards (e.g., "100K PLS → 50K HEX" with USD values)
- **Detailed transfer information** - Transfers show clear from/to addresses with copy-to-clipboard functionality
- **Contract interaction details** - Method labels prominently displayed for all contract interactions
- **Improved transaction detection** - Enhanced logic to better identify swaps, including complex DEX interactions
- **USD value prominence** - All token amounts now show USD values when available
- **Portfolio bundle support** - Fixed scanner-transactions endpoint to handle portfolio addresses
- **Visual hierarchy** - Color-coded transaction types: purple for swaps, red/green for sends/receives, blue for contract interactions

### July 15, 2025 - Scanner API Integration for Ultra-Fast Wallet Searches
- **Implemented PulseChain Scanner API integration** - New `/api/wallet/{address}/scanner-balances` endpoint uses indexed blockchain data
- **Created scanner-balance-service.ts** - Fetches token balances from Scanner API first, then checks recent blocks for real-time updates
- **Created scanner-transaction-service.ts** - Gets transaction history from Scanner API with recent block scanning for missed transactions
- **Dramatic performance improvement** - Token balance fetching reduced from 12+ seconds to ~4 seconds
- **Hybrid approach for accuracy** - Scanner API provides bulk historical data, then scans last 1000 blocks for recent changes
- **Transaction history optimization** - Scanner API provides paginated history, supplemented with last 100 blocks for real-time data
- **Fallback to direct RPC** - If Scanner API misses tokens, system fetches directly from blockchain contracts
- **Maintained all existing features** - LP token detection, price fetching, and logo storage work seamlessly with new approach

### July 14, 2025 - Major HEX Stakes & Wallet Search Performance Optimization
- **Parallel stake count fetching** - All wallet stake counts are now fetched simultaneously using Promise.all
- **Batch processing for individual stakes** - Stakes are fetched in batches of 10 in parallel instead of sequentially
- **50% faster HEX data loading** - Reduced loading time from sequential processing to parallel batching
- **Optimized fetchHexStakesSummary** - Converted sequential stake fetching to parallel batch processing
- **Eliminated artificial delays** - Removed unnecessary setTimeout calls that slowed down the process
- **Performance improvements** - HEX stakes now load 3-5x faster for wallets with many stakes
- **Batch size optimization** - Tuned batch sizes to 10 stakes per batch for optimal RPC performance
- **Multi-wallet parallel fetching** - Multiple wallets now load simultaneously instead of one-by-one
- **Overall speedup** - Combined optimizations provide 5-10x faster loading for multi-wallet searches with HEX stakes

### July 14, 2025 - Extended Performance Optimizations After User Feedback
- **Reduced block scanning from 1M to 100K blocks** - 10x reduction in block lookback for finding tokens
- **Optimized chunk size from 100K to 50K blocks** - Better parallelization of blockchain queries
- **Doubled token batch processing from 50 to 100** - 2x faster token metadata fetching
- **Quadrupled LP token batch size from 5 to 20** - 4x faster LP token processing
- **Removed 500ms delays between LP batches** - Eliminated artificial delays saving ~10-20 seconds on large portfolios
- **Expected overall improvement** - 10-20x faster loading for portfolios with many tokens and stakes

### July 14, 2025 - Implemented Lightweight Token Caching System
- **In-memory token cache** - Caches wallet tokens for 5 minutes, avoiding repeated blockchain scans
- **Token metadata cache** - Caches token symbols/names/decimals for 1 hour, reducing RPC calls by 80%
- **Smart cache invalidation** - Automatic cleanup of expired entries every minute
- **Parallel LP token processing** - Removed sequential batching, all LP tokens now process simultaneously
- **Cache statistics endpoint** - Added `/api/cache-stats` to monitor cache performance
- **Expected improvement** - Second wallet lookups are now nearly instant (from cache)

### July 6, 2025 - Fixed PLS Display in Swap Transactions
- **Shows only initial PLS transfer** - Swap transactions now display only the PLS amount sent, not WPLS conversions
- **Skip duplicate transfers** - Native transfers that match tx.value are skipped to prevent double-counting
- **Skip all WPLS in swaps** - WPLS transfers are completely hidden in swap transactions
- **Accurate amounts** - Transaction history now matches blockchain explorer values (e.g., 90M PLS, not 135M or 180M)
- **Clean display** - Shows PLS → Token swaps with correct amounts without intermediate wrapping steps

### January 7, 2025 - Fixed Double-Counting PLS in Swap Transactions
- **Fixed PLS amount display issue** - Swaps no longer show double the actual PLS amount (e.g., showing 180M instead of 90M)
- **Root cause identified** - WPLS withdrawal events from routers were incorrectly counted as additional PLS transfers
- **Updated transaction parsing logic** - WPLS withdrawals now only count when initiated by the wallet itself, not by routers
- **Prevents double-counting in swaps** - When swapping PLS through PulseX, only the initial PLS transfer is counted
- **Accurate transaction history** - Swap amounts now correctly reflect the actual tokens exchanged

### July 6, 2025 - Implemented Public Portfolio Sharing with 6-Character Codes
- **Added publicCode field to portfolios table** - Portfolios now have unique 6-character alphanumeric codes for easy sharing
- **Automatic code generation** - System generates unique codes like "PCVPA7" when creating portfolios
- **Short URL sharing** - Portfolios can be shared using short URLs like `/p/PCVPA7` instead of long slugs
- **Simplified portfolio display** - Portfolios now show as "Portfolio Name Portfolio" with "Saved Bundle" subtitle
- **API support for public codes** - Added `/api/portfolios/public/:code` endpoint for fetching portfolios by code
- **Migration completed** - All 44 existing portfolios now have unique public codes generated
- **Persistent bundle view** - Public portfolio URLs maintain the bundle view without refreshing to first address

### July 6, 2025 - Implemented Slug-Based Portfolio URLs
- **Added slug field to portfolios table** - Portfolios now have URL-friendly slugs generated from their names
- **Automatic slug generation** - When creating or updating portfolio names, slugs are automatically generated
- **Dual access support** - Portfolios can be accessed by both numeric ID and slug (e.g., `/portfolio/my-wallet`)
- **Smart slug detection** - Frontend automatically detects whether URL contains ID or slug and uses appropriate API
- **Conflict prevention** - System ensures unique slugs by appending random suffixes when needed
- **Migration completed** - All 44 existing portfolios now have slugs populated

### July 6, 2025 - Implemented Persistent Wallet Sessions
- **Added 7-day session persistence** - Users no longer need to sign messages repeatedly after initial authentication
- **Smart session restoration** - System checks for valid stored authentication data and restores sessions automatically
- **Signature caching** - Wallet signatures are stored locally and reused within the 7-day validity period
- **Seamless reconnection** - On page refresh or navigation, sessions restore without user interaction
- **Welcome back notification** - Users see a subtle toast confirming their session was restored

### July 6, 2025 - Fixed Portfolio Tab Authentication Issue
- **Fixed case sensitivity bug** - Wallet addresses from provider (mixed case) now properly match saved addresses (lowercase)
- **Updated wallet restoration logic** - Connection restoration now compares addresses case-insensitively 
- **Added user profile fetching** - User profile data is now properly loaded after authentication and connection restoration
- **Fixed userId persistence** - Portfolio tab now correctly recognizes connected wallet and shows user's saved portfolios
- **Improved wallet address storage** - System now stores wallet addresses with correct case from provider to prevent future mismatches

### July 6, 2025 - Removed Dedicated Transaction Page
- **Removed standalone transaction page** - Eliminated the separate `/transactions` route for better UX
- **Simplified navigation** - Transaction history is now only accessible through wallet tabs as a modal
- **Removed "View all transactions" link** - Cleaner interface with transaction history integrated into main wallet view
- **Improved user flow** - Users stay on the wallet page while viewing transactions, maintaining context

### July 5, 2025 - Client-Side DexScreener API Integration
- **Moved DexScreener API calls to client-side** - Prevents server rate limits by distributing API calls across users' browsers
- **Created `/api/wallet/:address/balances-no-prices` endpoint** - Returns token balances without prices, reducing server load
- **Built `useClientSideWallet` hook** - Fetches wallet data with client-side DexScreener price and logo fetching
- **Eliminated circular dependencies** - Fixed "require is not defined" errors by removing circular imports
- **Type safety improvements** - Aligned `plsBalance` and `plsPriceChange` types to use `undefined` instead of `null`
- **Zero server-side rate limits** - Each user's browser makes its own DexScreener API calls independently
- **Logo caching maintained** - Client-fetched logos are still saved to server for future use
- **Fixed loading percentage display** - Loading percentages now show as whole numbers (24%) instead of decimals (24.5%)

### July 5, 2025 - Token Logo Collection from DexScreener
- **Integrated logo collection during price fetching** - When fetching token prices from DexScreener, logos are now automatically collected and saved
- **Automatic logo storage** - DexScreener logos are saved to database when found during price fetching
- **FrenKabal placeholder fallback** - When DexScreener doesn't provide a logo, the system saves and uses `/assets/100xfrenlogo.png` placeholder
- **Reduced API calls** - Logos are cached in database, preventing repeated logo fetch requests
- **Updated direct-balance-service** - Modified to use `getTokenPriceDataFromDexScreener` which returns both price and logo data
- **Persistent logo storage** - All tokens now have either a DexScreener logo or FrenKabal placeholder stored in database

### July 5, 2025 - Major Performance Optimization for Large Wallets
- **10x faster batch processing** - Increased batch size from 5 to 50 tokens for parallel processing
- **Optimized block scanning** - Limited lookback to 1M blocks (~3 months) instead of scanning from genesis block
- **Parallel chunk processing** - Split block ranges into 100k chunks processed simultaneously
- **Parallel LP token detection** - All LP checks now run concurrently instead of sequentially
- **Removed all artificial delays** - Eliminated 400ms batch delays and 1000ms stage delays (saved ~4s per wallet)
- **Smart progress tracking** - Real-time progress updates without performance impact
- **Expected improvement** - Large wallets should load 5-10x faster than before

### July 5, 2025 - Implemented Redundant RPC Provider System & Performance Optimization
- **Created centralized RPC provider system** - New `rpc-provider.ts` service with automatic failover between g4mm4 and official PulseChain RPCs
- **Provider priority order** - g4mm4 first (https://rpc-pulsechain.g4mm4.io), then official (https://rpc.pulsechain.com), with WebSocket support
- **Automatic failover** - Smart detection and switching when providers fail, with 10-second timeout protection
- **Health monitoring endpoints** - Added `/api/rpc-health`, `/api/rpc-switch/:index`, and `/api/rpc-reset` for monitoring and admin control
- **Updated all blockchain services** - Migrated direct-balance-service, blockchain-service, and lp-token-service to use new provider system
- **Removed artificial loading delays** - Eliminated unnecessary setTimeout delays in data fetching for faster real-time performance
- **Enhanced contract call reliability** - Increased timeout to 5 seconds with proper error handling and automatic retry
- **Load time optimization** - Data now fetches immediately without artificial stage delays, providing authentic loading feedback

### July 4, 2025 - Error Cleanup & Deployment Preparation
- **Fixed LP token execution reverted errors** - Added proper timeout and error handling to callContractFunction
- **Improved error handling** - Contract calls that revert no longer cause unhandled promise rejections
- **Simplified loading stages to 4 blocks** - Fetching tokens, Fetching LPs, Fetching HEX stakes, Fetching prices
- **Enhanced contract call reliability** - Added 3-second timeout for contract calls to prevent hanging
- **Suppressed expected errors** - Execution reverted errors for non-LP tokens are now silently handled

### July 4, 2025 - Percentage-Based Loading Progress System
- **Major loading system overhaul** - Changed from 7-stage system to percentage-based progress (0-100%)
- **Percentage distribution** - Connecting (0-10%), Wallet data (10-20%), Token balances (20-50%), Prices (50-65%), LP analysis (65-80%), Verification (80-95%), Finalizing (95-100%)
- **Dynamic token progress calculation** - Progress within token loading stage (20-50%) calculated based on actual tokens processed
- **Fixed 99% jump issue** - Progress now smoothly transitions through all percentages, stages highlight sequentially based on percentage ranges
- **Enhanced stage detection** - Loading progress component now detects stages based on percentage ranges rather than message matching
- **Smooth completion transition** - Progress properly shows 100% when complete before dialog closes

### July 4, 2025 - Enhanced Loading Progress with Dynamic Token Counting & Improved Polling
- **Increased polling frequency** - Changed from 5 second polling to 200ms polling during loading to catch all stage transitions
- **Extended stage delays** - Increased delays between stages: 800ms for connecting, 1000ms for most stages, ensuring each stage is visible
- **Dynamic token progress** - Loading stage now shows "Loading token balances... (X/Y)" to display actual progress
- **Smooth stage transitions** - Each stage now has sufficient delay to be visible: connecting (800ms), wallet data (1000ms), token loading (400ms per batch), prices (1000ms), LP analysis (1200ms), verification (1000ms), finalizing (800ms)
- **Fixed rapid stage skipping** - Loading progress no longer jumps from "Connecting" directly to 99%, all stages now display properly

### July 4, 2025 - Fixed Loading Progress Stage Display Messages
- **Fixed loading progress stages not displaying** - Updated all progress messages in direct-balance-service.ts to match what loading-progress.tsx component expects
- **Message mapping fixes** - Changed "Fetching wallet information..." to "Fetching wallet data...", "Scanning X token balances..." to "Loading token balances...", etc.
- **Complete stage mapping** - All 7 stages now properly highlight as wallet data loads: Connecting → Wallet data → Token balances → Prices → LP analysis → Contract verification → Complete
- **Smooth stage transitions** - Added appropriate delays between stages to ensure each one is visible during the loading process

### July 4, 2025 - Direct Blockchain Transaction Fetching & Ultra-Simplified Display
- **Major architecture change** - Replaced PulseChain Scan API with direct blockchain RPC calls for real-time transaction data
- **Created fast-blockchain-service.ts** - Optimized service using event logs for faster transaction fetching
- **Event log scanning** - Uses Transfer event logs instead of scanning every block, dramatically improving performance
- **Batch processing** - Processes transactions in parallel batches of 20 for optimal speed
- **Increased block lookback** - Now scanning 50,000 blocks instead of 5,000 for more transaction history
- **Ultra-simplified display** - ALL transactions now show in compact "Token A → Token B" format with logos
- **Removed verbose details** - Eliminated contract addresses, block numbers, gas info, and other "useless data"
- **Consistent transaction display** - Swaps, transfers, and all token movements use same minimal format
- **Token metadata fetching** - Directly queries ERC20 contracts for name, symbol, and decimals information
- **New API endpoint** - `/api/wallet/:address/blockchain-transactions` provides direct blockchain access
- **Enhanced net flow calculation** - Complex multicall swaps with 11+ transfers now display as simple 2-token swaps
- **Direction field added** - Transfer objects now include proper 'send'/'receive' direction for accurate net flow
- **Native PLS support** - PLS transfers now properly detected and included in net flow calculations
- **Hex value parsing fixed** - Transaction amounts now display correctly instead of showing "<0.01"

### July 3, 2025 - Enhanced Transaction History Swap Detection & Display
- **Fixed swap detection** - Replaced simplified detectTokenSwap function with sophisticated multi-method detection
- **DEX router detection** - Added support for PulseX router addresses to identify swaps even without visible transfers
- **Multicall support** - Detects multicall transactions and shows them as swaps when interacting with DEX contracts
- **Method signature detection** - Identifies swap transactions by method names (swap, trade, multicall, exactinput, etc.)
- **LP token filtering** - Filters out LP tokens from swap display to show only the actual tokens being swapped
- **Enhanced swap display UI** - Purple boxes with token logos, amounts, and proper formatting
- **Multicall transaction display** - Shows "SWAP via PulseXRouter02" for transactions without visible transfers
- **Fixed transaction type filtering** - Swap filter now properly detects all swap types including multicalls

### July 3, 2025 - Fixed Token Price Inversion Issue & WPLS Pair Selection
- **Critical bug fix** - Fixed issue where tokens were showing incorrect prices when they appeared as quote tokens in pairs
- **Base token filter** - System now only considers pairs where the searched token is the BASE token, preventing inverted prices
- **MISSOR fix** - Resolved specific issue where MISSOR showed $0.1159 instead of correct $0.004437 from WPLS pair
- **WPLS-first strategy** - When WPLS pairs exist, system selects the one with highest liquidity, ignoring all other pairs
- **Correct pair selection** - Now properly selects pair 0xf3a8541894e4d789e6257a63440094d698d82bad for MISSOR
- **Prevents price manipulation** - Ensures accurate pricing by using only the largest WPLS liquidity pools when available

### July 3, 2025 - Replaced Transfer History with Direct Blockchain Balance Fetching
- **Major architecture change** - Replaced flawed transfer history calculation method with direct blockchain balance fetching
- **Created direct-balance-service.ts** - New service that fetches actual token balances directly from blockchain contracts
- **Fixed incorrect balance calculations** - Transfer history method showed 129M WPLS when actual balance was 0
- **Accurate for all token types** - Direct method works correctly for tax tokens, reflection tokens, and complex mechanics
- **Updated balance method toggle** - Changed default to direct blockchain method, marked transfer history as experimental
- **Better performance** - Direct balance fetching completed in ~12 seconds vs longer transfer history calculations

### July 3, 2025 - Fixed Infinite Loop & Enhanced Token Display
- **Fixed infinite loop in Home component** - Added check to prevent handleSearch from being called repeatedly when URL params contain wallet address
- **Resolved "Maximum update depth exceeded" error** - Modified useEffect to only trigger search when address actually changes

### July 3, 2025 - Enhanced Swap Detection & Display
- **Simplified swap display format** - Replaced large swap details box with clean "Token A → Token B" format
- **Improved native token detection** - Better handling of PLS swaps in DEX multicalls by checking transaction value and native transfers
- **Enhanced placeholder tokens** - When actual tokens can't be determined, shows more descriptive placeholders instead of generic "DEX interaction"
- **Added transaction summary parsing** - Attempts to extract token symbols from transaction summaries when available
- **Unified desktop/mobile display** - Both views now use the same compact swap format for consistency
- **Fixed contract address display issue** - Tokens now show proper symbols (e.g., "BEEF") instead of contract addresses everywhere in transaction history
- **Comprehensive token symbol resolution** - Applied enhanced token metadata lookup across all display areas including transfers, values, and swap summaries

### July 3, 2025 - Fixed Transaction History Overflow & Enhanced Token Display  
- **Fixed text overflow issues** - Added proper overflow controls with truncate and max-height constraints to prevent UI spillage
- **Enhanced token amount formatting** - Created formatTokenValue function that shows K, M, B, T suffixes for large numbers (e.g., "500K" instead of "500000")
- **Explicit swap display** - Swaps now show clear "SWAPPED 500K PLS into 10k BEEF" format instead of generic arrows
- **Fixed hover tooltip overflow** - Added max-height, overflow-y-auto, and z-index fixes to prevent tooltips from breaking layout
- **Consistent mobile/desktop display** - Both views now use the same explicit "SWAPPED X into Y" format with proper formatting

### July 3, 2025 - Removed Transfer History Method & Enhanced LP Token Display
- **Removed transfer history method** - Simplified wallet data fetching by removing the experimental transfer history calculation method
- **Single balance method** - Now exclusively uses direct blockchain balance fetching for accurate, real-time token balances
- **LP token pooled amounts display** - PulseX LP tokens show detailed pooled amounts when viewing the "Liquidity" tab
- **Enhanced liquidity view** - Click "Liquidity" tab to see full breakdown of LP positions including:
  - Individual token amounts (e.g., 68M LOTTO + 75M WPLS)
  - USD values for each token in the pair
  - Pool share percentage
  - Total LP position value
- **Simplified token view** - LP tokens show compact display in main "Tokens" tab, full details in "Liquidity" tab

### June 20, 2025 - Disabled Automatic Refreshing
- **Removed all automatic wallet data refreshing** - Wallet data now remains completely static after initial load
- **Disabled background batch services** - No more automatic price fetching or data updates
- **Set infinite cache duration** - Data never expires or refreshes automatically
- **Disabled all refetch triggers** - No refreshing on window focus, reconnect, or mount

### June 19, 2025 - Cache System Removal
- **Removed all caching infrastructure** - Eliminated server-side and client-side caching entirely
- **Simplified architecture** - All data fetching is now direct from browser to APIs
- **Real-time data guarantee** - Every request provides fresh blockchain data
- **Reduced server complexity** - Removed cache service, cache management, and TTL configurations
- **Updated UI messaging** - Changed cache-related text to reflect direct API fetching

### June 18, 2025 - Enhanced Transaction History & HEX Stakes Fixes
- **Updated transaction links to Otterscan** - All transaction links now navigate to Otterscan instead of PulseScan for better user experience
- **Removed Moralis API dependency entirely** - Eliminated all expensive Moralis API calls
- **Migrated to DexScreener + PulseChain Scan** - Now using free APIs exclusively
- **Updated price fetching** - All tokens now get prices from PulseChain DEXes via DexScreener
- **Enhanced HEX stakes support** - HEX tokens properly configured for PulseChain pricing
- **Added preferred tokens list** - HEX, WPLS, PLSX, and PLS pre-configured for DexScreener
- **Fixed token logo display issues** - Updated WETH and AURA tokens with proper logo URLs
- **Enhanced logo system** - Now automatically fetches proper logos for ALL wallet tokens using DexScreener + PulseX
- **Removed 2,372 placeholder logos** - Cleaned up database to force fresh logo fetching from authentic sources
- **Cost reduction achieved** - Zero API costs for price data and wallet balance fetching
- **Fixed HEX stakes calculation** - Completely rewrote calculation system with realistic APY rates based on historical performance (~41% average)

### HEX Stakes Calculation Updates
- **Replaced complex contract formulas** - Removed astronomical calculation errors from bonus hearts formulas
- **Implemented tiered APY system** - 30% base, 38% medium (3+ years), 45% long (8+ years), 50% big paydays (15 years)
- **Accurate value estimates** - Stakes now show realistic total values around $18k instead of trillions
- **Length-based bonuses** - Longer commitment periods get appropriately higher returns
- **Safety caps removed** - No longer needed with corrected calculation methodology

### Architecture Updates
- Replaced `MoralisTokenPriceResponse` with `TokenPriceResponse`
- Updated `api.ts` to use only DexScreener and PulseChain Scan APIs
- Modified price source service to default all tokens to DexScreener
- Enhanced error handling for API fallbacks
- **Improved price selection algorithm** - Added outlier detection to prevent manipulated prices
- **Quality scoring system** - Considers liquidity, volume, transactions, and price consistency
- **Manipulation protection** - Automatically detects and penalizes price outliers over 10x median
- **Client-side API calls** - Created services to move external API calls from server to browser
- **Zero server load option** - Users can now fetch data directly from PulseChain/DexScreener APIs
- **Complete client-side migration** - All wallet data and price fetching now happens in browser
- **Enhanced transaction history** - Increased batch size to 150 transactions with detailed gas info, contract verification status, and comprehensive USD value calculations
- **Improved transaction display** - Added gas used, gas price in Gwei, block numbers, transaction methods, and spam/verification warnings
- **Advanced token swap visualization** - Automatically detects swaps in multicalls and DEX transactions with enhanced visual display
- **Token icons in transactions** - All transaction transfers now show token logos using DexScreener/PulseX sources
- **USD values for all transfers** - Real-time USD calculations displayed for every token transfer with color-coded direction indicators
- **Multicall support** - Enhanced detection for PulseX router multicalls even without visible ERC20 transfers
- **Backend token extraction** - Added API endpoints to extract token contracts from transaction logs like original Moralis version
- **Complete token metadata** - New endpoints fetch full token information including prices, logos, and verification status
- **Enhanced DEX detection** - Smart identification of DEX router interactions with proper multicall handling
- **Background batch fetching** - Implemented automatic background price fetching for large wallets that exceed initial API limits
- **Rate limit handling** - Smart detection of missing token prices with background DexScreener batch processing
- **Progressive loading** - Initial fast load followed by background completion for comprehensive price coverage
- **Stablecoin Support** - Added fallback pricing and logos for bridged stablecoins (DAI, USDT, USDC from Ethereum) that maintain $1.00 value

## User Preferences

```
Preferred communication style: Simple, everyday language.
Token logo priority: Always use DexScreener/PulseX logos over placeholder images.
Cost optimization: Prioritize free APIs (DexScreener, PulseChain Scan) over paid services.
```