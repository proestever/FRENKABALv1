import { useState, useMemo } from 'react';

interface UsePaginationProps<T> {
  data: T[];
  itemsPerPage?: number;
}

export function usePagination<T>({ data, itemsPerPage = 50 }: UsePaginationProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  
  const totalPages = Math.ceil(data.length / itemsPerPage);
  
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(0, endIndex); // Show all items up to current page
  }, [data, currentPage, itemsPerPage]);
  
  const hasMore = currentPage < totalPages;
  
  const loadMore = () => {
    if (hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  };
  
  const reset = () => {
    setCurrentPage(1);
  };
  
  return {
    paginatedData,
    currentPage,
    totalPages,
    hasMore,
    loadMore,
    reset,
    totalItems: data.length,
    displayedItems: paginatedData.length
  };
}