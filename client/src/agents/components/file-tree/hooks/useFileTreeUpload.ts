import { useCallback, useState, useRef } from 'react';
import type { Project } from '../../../types/app';
import { api } from '../../../utils/api';

// Per-file upload cap. Matches nginx `client_max_body_size` on the ops site and
// the streaming write in the backend `upload_files` handler.
export const MAX_UPLOAD_MB = 300;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type UseFileTreeUploadOptions = {
  selectedProject: Project | null;
  onRefresh: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
};

// Helper function to read all files from a directory entry recursively
const readAllDirectoryEntries = async (directoryEntry: FileSystemDirectoryEntry, basePath = ''): Promise<File[]> => {
  const files: File[] = [];

  const reader = directoryEntry.createReader();
  let entries: FileSystemEntry[] = [];

  // Read all entries from the directory (may need multiple reads)
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    entries = entries.concat(batch);
  } while (batch.length > 0);

  // Files to ignore (system files)
  const ignoredFiles = ['.DS_Store', 'Thumbs.db', 'desktop.ini'];

  for (const entry of entries) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });

      // Skip ignored files
      if (ignoredFiles.includes(file.name)) {
        continue;
      }

      // Create a new file with the relative path as the name
      const fileWithPath = new File([file], entryPath, {
        type: file.type,
        lastModified: file.lastModified,
      });
      files.push(fileWithPath);
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const subFiles = await readAllDirectoryEntries(dirEntry, entryPath);
      files.push(...subFiles);
    }
  }

  return files;
};

export const useFileTreeUpload = ({
  selectedProject,
  onRefresh,
  showToast,
}: UseFileTreeUploadOptions) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragOver to false if we're leaving the entire tree
    if (treeRef.current && !treeRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDropTarget(null);
    }
  }, []);

  // Shared uploader for both drag-drop and the explicit "上传文件" button.
  // Enforces the per-file 300MB cap (oversize files are skipped with a warning
  // so the rest still upload).
  const uploadFiles = useCallback(
    async (incoming: File[], targetPath = '') => {
      if (!selectedProject) return;

      const tooBig = incoming.filter((f) => f.size > MAX_UPLOAD_BYTES);
      const files = incoming.filter((f) => f.size <= MAX_UPLOAD_BYTES);
      if (tooBig.length > 0) {
        const names = tooBig.map((f) => f.name.split('/').pop()).join('、');
        showToast(`已跳过超过 ${MAX_UPLOAD_MB}MB 的文件：${names}`, 'error');
      }
      if (files.length === 0) return;

      setOperationLoading(true);
      try {
        const formData = new FormData();
        formData.append('targetPath', targetPath);

        // FormData strips path info from File.name, so send the relative paths
        // (used for folder uploads) as a parallel JSON array.
        const relativePaths: string[] = [];
        files.forEach((file) => {
          const cleanFile = new File([file], file.name.split('/').pop()!, {
            type: file.type,
            lastModified: file.lastModified,
          });
          formData.append('files', cleanFile);
          relativePaths.push(file.name);
        });
        formData.append('relativePaths', JSON.stringify(relativePaths));

        const response = await api.post(
          // File upload endpoint is keyed by DB projectId post-migration.
          `/projects/${encodeURIComponent(selectedProject.projectId)}/files/upload`,
          formData,
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || data.detail || 'Upload failed');
        }

        showToast(`已上传 ${files.length} 个文件`, 'success');
        onRefresh();
      } catch (err) {
        console.error('Upload error:', err);
        showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
      } finally {
        setOperationLoading(false);
      }
    },
    [selectedProject, onRefresh, showToast],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const targetPath = dropTarget || '';
      const files: File[] = [];

      try {
        // Use DataTransferItemList for folder support
        const items = e.dataTransfer.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
              if (entry) {
                if (entry.isFile) {
                  const file = await new Promise<File>((resolve, reject) => {
                    (entry as FileSystemFileEntry).file(resolve, reject);
                  });
                  files.push(file);
                } else if (entry.isDirectory) {
                  // Pass the directory name as basePath so files keep the folder path
                  const dirFiles = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry, entry.name);
                  files.push(...dirFiles);
                }
              }
            }
          }
        } else {
          // Fallback for browsers that don't support webkitGetAsEntry
          for (const file of Array.from(e.dataTransfer.files)) {
            files.push(file);
          }
        }
      } catch (err) {
        console.error('Upload error:', err);
        showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
      }

      setDropTarget(null);
      await uploadFiles(files, targetPath);
    },
    [dropTarget, uploadFiles, showToast],
  );

  const handleItemDragOver = useCallback((e: React.DragEvent, itemPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(itemPath);
  }, []);

  const handleItemDrop = useCallback((e: React.DragEvent, itemPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(itemPath);
  }, []);

  return {
    isDragOver,
    dropTarget,
    operationLoading,
    treeRef,
    uploadFiles,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleItemDragOver,
    handleItemDrop,
    setDropTarget,
  };
};
