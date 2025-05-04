import { shortenAddress } from "@/lib/utils";

interface ClickableAddressProps {
  address: string;
  showPrefix?: boolean;
  className?: string;
}

export function ClickableAddress({ address, showPrefix = false, className = "" }: ClickableAddressProps) {
  return (
    <a 
      href={`/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-gray-400 hover:text-teal-400 hover:underline ${className}`}
    >
      {showPrefix && (address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? 'PLS Native: ' : '')}
      {shortenAddress(address)}
    </a>
  );
}