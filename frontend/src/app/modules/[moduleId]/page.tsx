'use client';

import { ModuleContainer } from '@/components/shell/ModuleContainer';

export default function ModulePage({ params }: { params: { moduleId: string } }) {
  return <ModuleContainer moduleId={params.moduleId} />;
}
