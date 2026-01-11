"use client";

interface DownloadCSVButtonProps {
  csvContent: string;
  filename: string;
}

export function DownloadCSVButton({ csvContent, filename }: DownloadCSVButtonProps) {
  const handleDownload = () => {
    const csvDataURL = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
    const link = document.createElement("a");
    link.href = csvDataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return <button onClick={handleDownload}>Download CSV</button>;
}
