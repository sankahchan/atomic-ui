import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
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
            <div className="md:hidden">
                <EmptyState
                    icon={Inbox}
                    title="Nothing to show"
                    description={emptyMessage}
                    className="min-h-[180px]"
                />
            </div>
        );
    }

    return (
        <div className={cn("ops-mobile-card-grid md:hidden", className)}>
            {data.map((item) => (
                <Card key={keyExtractor(item)} className="ops-mobile-card overflow-hidden">
                    <CardContent className="p-0">
                        <div className="p-4 sm:p-4">
                            {renderCard(item)}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
