import type { Contact } from "@/types/campaign";

/** Stand-in contact list until campaigns are stored in Supabase. */
export const SAMPLE_CONTACTS: Contact[] = [
  { id: "ct1", name: "Marta Reyes", phoneNumber: "+1 415 555 0182" },
  { id: "ct2", name: "Daniel Osei", phoneNumber: "+1 415 555 0147" },
  { id: "ct3", name: "Priya Raman", phoneNumber: "+1 628 555 0119" },
  { id: "ct4", name: "Tom Whitfield", phoneNumber: "+1 415 555 0163" },
  { id: "ct5", name: "Alina Kovacs", phoneNumber: "+1 415 555 0104" },
  { id: "ct6", name: "Jared Lin", phoneNumber: "+1 415 555 0138" },
  { id: "ct7", name: "Sofia Duarte", phoneNumber: "+1 415 555 0171" },
  { id: "ct8", name: "Owen Barr", phoneNumber: "+1 415 555 0115" },
];

export const SAMPLE_CSV = `Marta Reyes, +1 415 555 0182
Daniel Osei, +1 415 555 0147
Priya Raman, +1 628 555 0119`;
