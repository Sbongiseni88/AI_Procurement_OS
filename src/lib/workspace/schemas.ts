import { z } from "zod";

export const OnboardingSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, { error: "Enter your company’s name." })
    .max(200, { error: "Use 200 characters or fewer." }),
  fullName: z
    .string()
    .trim()
    .min(1, { error: "Enter your name." })
    .max(200, { error: "Use 200 characters or fewer." }),
});

export type OnboardingFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<string, string>>;
      values: { companyName: string; fullName: string };
    };
