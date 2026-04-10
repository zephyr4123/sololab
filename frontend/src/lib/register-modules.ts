/**
 * Client-side plugin registration.
 *
 * Import this in client components that need plugin data (ModuleContainer).
 * Each import triggers the side-effect of registering the plugin.
 */
'use client';

import '@/components/modules/ideaspark/plugin.tsx';
import '@/components/modules/codelab/plugin';
import '@/components/modules/writer/plugin.tsx';
