// Stage icon names (from catalog/stages.js) -> lucide components.
import {
    Users, ClipboardList, IndianRupee, Banknote, ShoppingBag, Package, Truck, Wrench, Camera, Send, Gauge,
    ClipboardCheck, Tag, CheckCircle2, PauseCircle, FileText, Home, Phone, Calendar, Zap, Sun, Hammer, Ruler,
    ShieldCheck, Star, Flag,
} from 'lucide-react';

export const STAGE_ICONS = {
    Users, ClipboardList, IndianRupee, Banknote, ShoppingBag, Package, Truck, Wrench, Camera, Send, Gauge,
    ClipboardCheck, Tag, CheckCircle2, PauseCircle, FileText, Home, Phone, Calendar, Zap, Sun, Hammer, Ruler,
    ShieldCheck, Star, Flag,
};

export const stageIcon = name => STAGE_ICONS[name] || ClipboardList;
