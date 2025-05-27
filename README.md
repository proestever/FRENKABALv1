# PulseChain Wallet Tracker

A comprehensive PulseChain wallet tracking application that provides real-time blockchain insights, portfolio management, and advanced wallet analytics.

## Features

✨ **Real-time Wallet Tracking**
- Track multiple PulseChain wallet addresses
- Real-time token balance updates
- Native PLS balance monitoring

🚀 **Advanced Portfolio Management**
- Create and manage multiple portfolios
- Bookmark favorite wallet addresses
- Track portfolio performance over time

💰 **Price & Market Data**
- Live token prices from multiple sources
- 24-hour price change tracking
- USD value calculations for all holdings

🔄 **LP Token Support**
- Automatic LP token detection
- PulseX liquidity pool analysis
- Token pair identification

📊 **Transaction History**
- Complete transaction tracking
- Transfer history with details
- Smart categorization

🎯 **Advanced Features**
- Token hiding/filtering
- Search and discovery tools
- Responsive mobile design
- Dark/light theme support

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain APIs**: Moralis + PulseChain Scan
- **Price Data**: DexScreener integration

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Moralis API key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/pulsechain-wallet-tracker.git
cd pulsechain-wallet-tracker
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```env
DATABASE_URL=your_postgresql_connection_string
MORALIS_API_KEY=your_moralis_api_key
```

4. **Set up the database**
```bash
npm run db:push
```

5. **Start the development server**
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## API Keys Setup

### Moralis API Key
1. Sign up at [moralis.io](https://moralis.io/)
2. Create a new project
3. Copy your API key from the project settings
4. Add it to your `.env` file as `MORALIS_API_KEY`

## Project Structure

```
├── client/          # React frontend
├── server/          # Express backend
├── shared/          # Shared types and schemas
├── public/          # Static assets
└── components.json  # UI component configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions, please open an issue on GitHub.

---

**Built with ❤️ for the PulseChain community**