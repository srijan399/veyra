import type { Contact } from "@/types/campaign";

/** Reserved fictional NANP contacts used only when initializing a compiled draft. */
export const SAMPLE_CONTACTS: Contact[] = [
  { id: "ct1", name: CALLE_TEST_HOTLINE_NAME, phoneNumber: CALLE_TEST_HOTLINE_PHONE },
  { id: "ct2", name: "Daniel Osei", phoneNumber: "+14155550101" },
  { id: "ct3", name: "Priya Raman", phoneNumber: "+14155550102" },
  { id: "ct4", name: "Tom Whitfield", phoneNumber: "+14155550103" },
  { id: "ct5", name: "Alina Kovacs", phoneNumber: "+14155550104" },
  { id: "ct6", name: "Jared Lin", phoneNumber: "+14155550105" },
  { id: "ct7", name: "Sofia Duarte", phoneNumber: "+14155550106" },
  { id: "ct8", name: "Owen Barr", phoneNumber: "+14155550107" },
];
import {
  CALLE_TEST_HOTLINE_NAME,
  CALLE_TEST_HOTLINE_PHONE,
} from "@/lib/calle/test-hotline";
