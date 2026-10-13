import logo from '../assets/solarflow-logo-blue.svg?inline';
import { freshTemplate } from './model';
export function brandedTemplate() {
    const template = freshTemplate();
    template.assets = { solarflowLogoUrl:logo };
    return template;
}
