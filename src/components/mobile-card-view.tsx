import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import React from "react";

interface MobileCardViewProps<T> {
    data: T[];
    renderCard: (item: T) => React.ReactNode;
    keyExtractor: (item: T) => string;
    className?: string;
    emptyMessage?: string;
}

export function MobileCardView<T>({
    data,
    renderCard,
    keyExtractor,
    className,
    emptyMessage = "No items found",
}: MobileCardViewProps<T>) {
    if (!data || data.length === 0) {
        return (
            <div className="ops-chart-empty px-6 py-8 text-sm text-muted-foreground md:hidden">
                <div className="space-y-1">
                    <p className="font-medium text-foreground">Nothing to show</p>
                    <p>{emptyMessage}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("space-y-4 md:hidden", className)}>
            {data.map((item) => (
                <Card key={keyExtractor(item)} className="ops-mobile-card overflow-hidden">
                    <CardContent className="p-0">
                        <div className="p-4">
                        {renderCard(item)}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
