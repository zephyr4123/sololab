'use client';

import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

interface DocumentUploaderProps {
  onUpload?: (file: File) => void;
}

export function DocumentUploader({ onUpload }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      onUpload?.(file);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
        isDragging ? 'border-primary bg-accent' : 'border-muted hover:border-primary/50'
      }`}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Drop PDF here or click to upload</p>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
