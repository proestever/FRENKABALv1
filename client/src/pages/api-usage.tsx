import { ApiUsageViewer } from '@/components/api-usage-viewer';

export default function ApiUsagePage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
        API Usage Monitor
      </h1>
      
      <div className="max-w-5xl mx-auto">
        <ApiUsageViewer />
        
        <div className="mt-10 p-6 border border-muted rounded-lg bg-card/50 shadow-md backdrop-blur-sm">
          <h2 className="text-xl font-semibold mb-4">About API Usage Tracking</h2>
          
          <p className="mb-4">
            This tool helps you monitor your API consumption to ensure you stay within your monthly limits.
            Each wallet generates API calls when viewed, and different operations consume varying amounts of 
            Consumption Units (CUs).
          </p>
          
          <h3 className="text-lg font-semibold mt-6 mb-2">Consumption Unit (CU) Weights</h3>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Wallet Data Retrieval:</strong> 5 CUs</li>
            <li><strong>Transaction History:</strong> 5 CUs</li>
            <li><strong>HEX Stakes:</strong> 3 CUs</li>
            <li><strong>Token Price Check:</strong> 2 CUs</li>
            <li><strong>Token Logo Fetch:</strong> 1 CU</li>
          </ul>
          
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <h3 className="text-md font-semibold mb-2">Cache Benefits</h3>
            <p>
              When data is served from cache, it consumes only 20% of the normal CUs.
              Our caching system significantly reduces API calls:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4 mt-2 text-sm">
              <li>Wallet data is cached for 3 minutes</li>
              <li>Token prices are cached for 5 minutes</li>
              <li>Transaction history is cached for 10 minutes</li>
              <li>Token logos are cached for 24 hours</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}