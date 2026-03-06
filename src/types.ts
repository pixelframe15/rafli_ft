export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  note?: string;
}

export const CATEGORIES = {
  income: ["Allowance", "Salary", "Gift", "Other"],
  expense: [
    "Food & Drink",
    "Tuition",
    "Transport",
    "Rent",
    "Entertainment",
    "Shopping",
    "Health",
    "Other",
  ],
};

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}
