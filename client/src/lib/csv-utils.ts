// Using internal interfaces instead of importing from schema to avoid type mismatches
interface BookmarkLike {
  walletAddress: string;
  label?: string | null;
  notes?: string | null;
  isFavorite?: boolean;
  [key: string]: any; // Allow other properties
}

/**
 * Convert bookmarks to CSV string
 */
export function bookmarksToCSV(bookmarks: BookmarkLike[]): string {
  // Define the header row
  const headers = ['Wallet Address', 'Label', 'Notes', 'Is Favorite'];
  
  // Create CSV content
  const csvRows = [
    // Header row
    headers.join(','),
    
    // Data rows
    ...bookmarks.map(bookmark => {
      const { walletAddress, label, notes, isFavorite } = bookmark;
      // Escape values with quotes if they contain commas
      const escapedLabel = label ? `"${label.replace(/"/g, '""')}"` : '';
      const escapedNotes = notes ? `"${notes.replace(/"/g, '""')}"` : '';
      return [
        walletAddress,
        escapedLabel,
        escapedNotes,
        isFavorite ? 'true' : 'false'
      ].join(',');
    })
  ];
  
  // Join rows with newline characters
  return csvRows.join('\n');
}

/**
 * Parse CSV string to bookmarks
 */
export function csvToBookmarks(csvString: string): { walletAddress: string; label?: string; notes?: string; isFavorite?: boolean }[] {
  // Split the CSV into rows
  const rows = csvString.split('\n').filter(row => row.trim() !== '');
  
  // Check if there are any rows (at least a header)
  if (rows.length === 0) {
    return [];
  }
  
  // Skip the header row and process data rows
  const bookmarks = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    
    // Parse the CSV row, handling quoted values properly
    const values = parseCSVRow(row);
    
    // Must have at least a wallet address
    if (values.length === 0 || !values[0]) continue;
    
    const walletAddress = values[0].trim();
    
    // Basic validation for Ethereum addresses
    if (!isValidEthereumAddress(walletAddress)) {
      continue;
    }
    
    const bookmark = {
      walletAddress,
      label: values[1]?.trim() || undefined,
      notes: values[2]?.trim() || undefined,
      isFavorite: values[3]?.toLowerCase() === 'true'
    };
    
    bookmarks.push(bookmark);
  }
  
  return bookmarks;
}

/**
 * Parse a single CSV row, handling quoted fields properly
 */
function parseCSVRow(row: string): string[] {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"' && (i === 0 || row[i-1] !== '\\')) {
      // Toggle quote state
      if (inQuotes && i < row.length - 1 && row[i+1] === '"') {
        // Handle escaped quotes (double quotes inside a quoted field)
        current += '"';
        i++; // Skip the next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Don't forget the last field
  result.push(current);
  
  return result;
}

/**
 * Basic validation for Ethereum addresses
 */
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Generate an example CSV string
 */
export function getExampleCSV(): string {
  // Create example data in CSV format directly to avoid type issues
  return `Wallet Address,Label,Notes,Is Favorite
0x1234567890123456789012345678901234567890,My Main Wallet,This is my primary wallet for daily transactions,true
0xabcdefabcdefabcdefabcdefabcdefabcdefabcd,Investment Wallet,Long-term holdings and staking,false`;
}

/**
 * Download content as a file
 */
export function downloadAsFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  // Clean up
  URL.revokeObjectURL(url);
}