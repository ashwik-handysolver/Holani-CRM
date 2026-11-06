import React from 'react';
import { UploadCloud } from 'lucide-react';
import { useStore } from '../store';
import { Card, EmptyState } from '../components/ui';
import { QueueList } from '../components/UploadPanel';

/** Progress of recordings being analysed. Uploading itself starts from the header's Upload button. */
export const Upload: React.FC = () => {
  const { customers, queue } = useStore();
  const names = Object.fromEntries(customers.map((c) => [c.id, c.name]));

  if (queue.length === 0) {
    return (
      <Card>
        <EmptyState icon={UploadCloud} title="Nothing uploading" text="Use the Upload button at the top to add a recording." />
      </Card>
    );
  }
  return <QueueList items={queue} names={names} />;
};
