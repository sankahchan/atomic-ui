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
            <div className="text-center py-8 text-muted-foreground md:hidden">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={cn("space-y-4 md:hidden", className)}>
            {data.map((item) => (
                <Card key={keyExtractor(item)} className="overflow-hidden">
                    <CardContent className="p-3">
                        {renderCard(item)}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
