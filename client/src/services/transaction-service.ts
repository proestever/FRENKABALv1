// Service to fetch enhanced transaction details with token metadata
export async function fetchTransactionDetails(hash: string) {
  try {
    const response = await fetch(`/api/transaction/${hash}/details`);
    if (!response.ok) {
      throw new Error('Failed to fetch transaction details');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    return null;
  }
}

// Extract token metadata from transaction
export function extractTokensFromTxDetails(txDetails: any): { sent: any[], received: any[] } {
  const tokens = { sent: [] as any[], received: [] as any[] };
  
  if (!txDetails || !txDetails.tokenMetadata) {
    return tokens;
  }
  
  // Match token metadata with transfers if available
  if (txDetails.token_transfers) {
    txDetails.token_transfers.forEach((transfer: any) => {
      const tokenMeta = txDetails.tokenMetadata.find(
        (meta: any) => meta.address.toLowerCase() === transfer.token?.address?.toLowerCase()
      );
      
      if (tokenMeta) {
        const enhancedTransfer = {
          ...tokenMeta,
          amount: transfer.total?.value || transfer.value,
          direction: transfer.from?.toLowerCase() === txDetails.from?.toLowerCase() ? 'sent' : 'received'
        };
        
        if (enhancedTransfer.direction === 'sent') {
          tokens.sent.push(enhancedTransfer);
        } else {
          tokens.received.push(enhancedTransfer);
        }
      }
    });
  }
  
  // If no token transfers but we have metadata, it might be a complex swap
  if (tokens.sent.length === 0 && tokens.received.length === 0 && txDetails.tokenMetadata.length > 0) {
    // Try to infer from logs or other data
    txDetails.tokenMetadata.forEach((token: any, index: number) => {
      // First token is usually sent, last is usually received in swaps
      if (index === 0) {
        tokens.sent.push({ ...token, amount: 'Unknown' });
      } else if (index === txDetails.tokenMetadata.length - 1) {
        tokens.received.push({ ...token, amount: 'Unknown' });
      }
    });
  }
  
  return tokens;
}