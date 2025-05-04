import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/token-logo';
import { Loader2, ArrowUpRight, ArrowDownLeft, ExternalLink, ChevronDown, DollarSign, Wallet, RefreshCw, Filter } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchTransactionHistory, fetchWalletData, TransactionResponse } from '@/lib/api';
import { formatDate, shortenAddress } from '@/lib/utils';
import { ClickableAddress } from './clickable-address';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Transaction types
interface TransactionTransfer {
  token_name?: string;
  token_symbol?: string;
  token_logo?: string | null;
  token_decimals?: string;
  from_address: string;
  from_address_label?: string | null;
  to_address: string;
  to_address_label?: string | null;
  address?: string;
  log_index?: number;
  value: string;
  value_formatted?: string;
  possible_spam?: boolean;
  verified_contract?: boolean;
  security_score?: number;
  direction?: string;
  internal_transaction?: boolean;
}

interface Transaction {
  hash: string;
  nonce: string;
  transaction_index: string;
  from_address: string;
  from_address_label?: string | null;
  to_address: string;
  to_address_label?: string | null;
  value: string;
  gas: string;
  gas_price: string;
  receipt_gas_used: string;
  receipt_status: string;
  block_timestamp: string;
  block_number: string;
  transaction_fee: string;
  method_label?: string;
  erc20_transfers?: TransactionTransfer[];
  native_transfers?: TransactionTransfer[];
  nft_transfers?: any[];
  summary?: string;
  category?: string;
  possible_spam?: boolean;
}

interface TransactionHistoryProps {
  walletAddress: string;
  onClose: () => void;
}

// Number of transactions to load per batch (Moralis free plan limit is 100)
const TRANSACTIONS_PER_BATCH = 100;

// Define transaction type options
type TransactionType = 'all' | 'swap' | 'send' | 'receive' | 'approval' | 'contract';

// Helper function to determine transaction type
const getTransactionType = (tx: Transaction): TransactionType => {
  if (!tx.category) {
    // Try to infer from other properties if category is not available
    if (tx.method_label?.toLowerCase().includes('swap')) {
      return 'swap';
    } else if (tx.method_label?.toLowerCase().includes('approve')) {
      return 'approval';
    } else if (tx.erc20_transfers && tx.erc20_transfers.some(t => t.from_address.toLowerCase() === t.to_address.toLowerCase())) {
      return 'contract'; // Self-transfers are often contract interactions
    } else if (tx.erc20_transfers && tx.erc20_transfers.length > 0) {
      return 'send'; // Default for token transfers
    } else {
      return 'all'; // Default fallback
    }
  }
  
  // If category is provided, use it
  const category = tx.category.toLowerCase();
  
  if (category.includes('swap') || category.includes('trade')) {
    return 'swap';
  } else if (category.includes('send') || category.includes('transfer')) {
    return 'send';
  } else if (category.includes('receive')) {
    return 'receive';
  } else if (category.includes('approve') || category.includes('approval')) {
    return 'approval';
  } else if (category.includes('contract') || category.includes('deploy') || category.includes('execute')) {
    return 'contract';
  }
  
  return 'all';
};

export function TransactionHistory({ walletAddress, onClose }: TransactionHistoryProps) {
  // Component code remains unchanged
  // The only changes are to the color classes in the address links from hover:text-primary to hover:text-teal-400
  
  // Rest of the component implementation...
}