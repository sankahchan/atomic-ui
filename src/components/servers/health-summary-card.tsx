'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * HealthSummaryCard Component
 * 
 * Displays aggregate health statistics in a compact format. These cards
 * appear at the top of the page to give administrators a quick overview
 * of the overall health status.
 */
export function HealthSummaryCard({
    title,
    value,
    icon: Icon,
    color,
    description,
}: {
    title: string;
    value: number | string;
    icon: React.ElementType;
    color: string;
    description?: string;
}) {
    return (
        <Card>
            <CardContent className="p-4 sm:p-6">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <p className="text-2xl font-bold sm:text-3xl">{value}</p>
                        {description && (
                            <p className="text-xs text-muted-foreground">{description}</p>
                        )}
                    </div>
                    <div className={cn('rounded-xl p-2.5 sm:p-3', color)}>
                        <Icon className="w-5 h-5" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
