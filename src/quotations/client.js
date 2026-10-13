import { supabase } from '../supabase';
import { createQuotationRepository } from './repository';
export const quotationRepository = createQuotationRepository(supabase);
