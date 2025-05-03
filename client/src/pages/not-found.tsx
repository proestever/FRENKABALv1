import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [_, setLocation] = useLocation();

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(150,70,255,0.1),transparent_70%)] pointer-events-none"></div>
      <Card className="w-full max-w-md mx-4 border-border shadow-lg backdrop-blur-sm bg-card/70 relative z-10">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center mb-4 text-center">
            <AlertCircle className="h-16 w-16 text-error mb-4" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              404 Page Not Found
            </h1>
          </div>

          <p className="mt-4 mb-6 text-center text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          
          <div className="flex justify-center">
            <Button 
              onClick={() => setLocation('/')}
              className="bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 transition"
            >
              Go Back Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
