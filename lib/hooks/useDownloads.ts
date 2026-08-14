import { useContext } from 'react';
import { DownloadContext, DownloadContextType } from '@lib/providers/DownloadProvider';

export function useDownloads(): DownloadContextType {
    return useContext(DownloadContext);
}
