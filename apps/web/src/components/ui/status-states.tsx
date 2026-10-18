'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, Inbox, RefreshCw } from 'lucide-react';
import { useLocalization } from '@/hooks/use-localization';

export function LoadingState({ message }: { message?: string }) {
  const { t } = useLocalization();
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{message || t('sharedComponents.loadingEllipsis', t('common.loading', 'Loading...'))}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="mt-2 text-sm text-destructive">{message || t('sharedComponents.somethingWentWrong')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('sharedComponents.tryAgain')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Inbox className="h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{message || t('sharedComponents.noDataFound')}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
