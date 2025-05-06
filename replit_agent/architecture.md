# Architecture Overview

## Overview

FrenKabal is a PulseChain wallet explorer application that allows users to track token balances, portfolio values, and transaction history on the PulseChain blockchain. The application follows a client-server architecture with a React frontend and a Node.js/Express backend. It utilizes PostgreSQL for data storage via Drizzle ORM.

## System Architecture

### High-Level Architecture

The application follows a modern full-stack JavaScript architecture:

1. **Frontend**: React-based SPA (Single Page Application) using Vite as the build tool
2. **Backend**: Express.js server running on Node.js
3. **Database**: PostgreSQL database accessed via Drizzle ORM
4. **API Layer**: RESTful API endpoints that connect the frontend to backend services
5. **External Services**: Integration with blockchain data providers (PulseChain Scan API, Moralis, DexScreener)

### Key Design Decisions

- **Monorepo Structure**: The codebase is organized as a monorepo with client, server, and shared directories
- **Server-Side Rendering**: The application uses client-side rendering but with server-side API endpoints
- **Type Safety**: TypeScript is used throughout the application for type safety
- **Database Access**: Drizzle ORM is used for database access with a schema-first approach
- **UI Components**: Uses shadcn/ui component library (based on Radix UI) with Tailwind CSS

## Key Components

### Frontend Components

1. **Client Application**
   - Located in `/client/src/`
   - Built with React, TypeScript, and Tailwind CSS
   - Uses React Query for data fetching and state management
   - Implements custom hooks for wallet connectivity, token data, and transactions

2. **UI Components**
   - Located in `/client/src/components/`
   - Mix of shadcn/ui (Radix UI) components and custom components
   - Implements responsive design patterns
   - Uses Tailwind CSS for styling

3. **Pages**
   - Located in `/client/src/pages/`
   - Key pages include Home, Profile, and Donations
   - Implements route-based code splitting

4. **Hooks and Utilities**
   - Located in `/client/src/hooks/` and `/client/src/lib/`
   - Custom hooks for wallet connection, token data fetching, and blockchain interactions
   - Utility functions for data formatting, API requests, and file operations

### Backend Components

1. **Express Server**
   - Located in `/server/`
   - Provides RESTful API endpoints
   - Handles session management and authentication
   - Implements server-side caching strategies

2. **API Services**
   - Located in `/server/services/`
   - Services for interacting with blockchain data providers
   - Implements data transformation and aggregation
   - Includes services for token prices, transaction history, and donations

3. **Database Access Layer**
   - Centered around Drizzle ORM
   - Schema defined in `/shared/schema.ts`
   - Implements storage interfaces in `/server/storage.ts`

4. **Middleware**
   - Request logging
   - Error handling
   - Static file serving

### Shared Components

1. **Database Schema**
   - Located in `/shared/schema.ts`
   - Defines database tables, relationships, and validation schemas using Drizzle ORM and Zod
   - Used by both frontend and backend

2. **Type Definitions**
   - Located in `/shared/` and `/server/types.ts`
   - Shared type definitions for API responses, blockchain data, and application entities

## Data Flow

### Authentication Flow

1. User connects their Ethereum wallet (MetaMask or similar) using Web3 API
2. Backend verifies wallet ownership and retrieves or creates a user account
3. Session is established and maintained for the authenticated user

### Wallet Data Flow

1. User enters a PulseChain wallet address in the search interface
2. Frontend sends request to backend API
3. Backend fetches data from blockchain data providers (PulseChain Scan, Moralis)
4. Data is processed, transformed, and cached on the backend
5. Processed data is returned to the frontend
6. Frontend renders the wallet data, including token balances and values

### Profile and Bookmarks Flow

1. Authenticated users can create bookmarks for wallet addresses
2. Bookmarks are stored in the PostgreSQL database
3. Users can manage their profiles and bookmarks
4. Import/export functionality for bookmarks via CSV

## External Dependencies

### Blockchain Data Providers

1. **PulseChain Scan API**
   - Used for fetching basic wallet information and token balances
   - API endpoint: `https://api.scan.pulsechain.com/api/v2`

2. **Moralis API**
   - Used for token prices and additional wallet data
   - Provides enhanced blockchain data access

3. **DexScreener API**
   - Used for more accurate token pricing data
   - API endpoint: `https://api.dexscreener.com/latest/dex`

### Database

1. **PostgreSQL**
   - Used via Neon Serverless Postgres
   - Connected using `@neondatabase/serverless` package
   - Schema managed with Drizzle ORM

### Frontend Libraries

1. **React & React Query**
   - Core frontend framework
   - Data fetching and state management

2. **shadcn/ui & Radix UI**
   - UI component library
   - Accessible and customizable components

3. **Tailwind CSS**
   - Utility-first CSS framework
   - Theme configuration in `tailwind.config.ts`

4. **ethers.js**
   - Ethereum wallet integration
   - Blockchain interactions

## Deployment Strategy

The application is configured for deployment on Replit, with support for other platforms:

1. **Development Environment**
   - Local development using `npm run dev`
   - Uses Vite's development server with HMR

2. **Build Process**
   - Frontend built with Vite: `vite build`
   - Backend bundled with esbuild
   - Combined build process defined in package.json

3. **Database Management**
   - Drizzle ORM migrations via `drizzle-kit push`
   - Database schema visualization with `drizzle-kit studio`

4. **Deployment Configuration**
   - Replit deployment configured in `.replit`
   - Environment variables for database connections
   - Static assets served from `/server/public`

5. **Runtime Configuration**
   - NODE_ENV used to determine environment
   - Different configuration for development vs production
   - Database URL provided via environment variables