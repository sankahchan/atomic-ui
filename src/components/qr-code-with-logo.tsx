
import Image from 'next/image';
import { Atom } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QRCodeWithLogoProps {
    dataUrl: string;
    size?: number;
    logoSize?: number;
    className?: string;
}

export function QRCodeWithLogo({
    dataUrl,
    size = 200,
    logoSize = 40,
    className
}: QRCodeWithLogoProps) {
    return (
        <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
            <Image
                src={dataUrl}
                alt="QR Code"
                width={size}
                height={size}
                className="rounded-lg"
                unoptimized
            />

            {/* Logo Overlay */}
            <div className="absolute flex items-center justify-center bg-background rounded-full p-1 shadow-sm border border-border/50">
                <div className="bg-primary/10 rounded-full p-1.5 flex items-center justify-center">
                    <Atom className="text-primary fill-primary/20" style={{ width: logoSize - 12, height: logoSize - 12 }} />
                </div>
            </div>
        </div>
    );
}
