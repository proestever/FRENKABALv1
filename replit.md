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

### June 18, 2025 - Moralis Integration Removal & Token Logo Fixes
- **Removed Moralis API dependency entirely** - Eliminated all expensive Moralis API calls
- **Migrated to DexScreener + PulseChain Scan** - Now using free APIs exclusively
- **Updated price fetching** - All tokens now get prices from PulseChain DEXes via DexScreener
- **Enhanced HEX stakes support** - HEX tokens properly configured for PulseChain pricing
- **Added preferred tokens list** - HEX, WPLS, PLSX, and PLS pre-configured for DexScreener
- **Fixed token logo display issues** - Updated WETH and AURA tokens with proper logo URLs
- **Enhanced logo system** - Now automatically fetches proper logos for ALL wallet tokens using DexScreener + PulseX
- **Removed 2,372 placeholder logos** - Cleaned up database to force fresh logo fetching from authentic sources
- **Cost reduction achieved** - Zero API costs for price data and wallet balance fetching
- **Fixed HEX stakes calculation** - Replaced incorrect 35% APY simple interest with proper HEX share-based calculation using bonus hearts formula from contract

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

## User Preferences

```
Preferred communication style: Simple, everyday language.
Token logo priority: Always use DexScreener/PulseX logos over placeholder images.
Cost optimization: Prioritize free APIs (DexScreener, PulseChain Scan) over paid services.
```