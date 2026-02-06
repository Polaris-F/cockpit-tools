import { Github } from 'lucide-react';

interface CopilotIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CopilotIcon({ size = 20, className, style }: CopilotIconProps) {
  return <Github size={size} className={className} style={style} />;
}
