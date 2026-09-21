import { CustomError } from "../errors/customError.error";
import { ACCOUNT_TYPES, User } from "../models/user.model";
import { assertObjectId, cleanText, parseEnum } from "../utils/validation";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOT_FOUND = "Usuario no encontrado";
const MIN_PASSWORD = 8;

export interface StaffUserDto {
  id: string;
  email: string;
  name: string;
  phone: string;
  accountType: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function serializeUser(user: any): StaffUserDto {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name || "",
    phone: user.phone || "",
    accountType: user.accountType,
    isActive: !!user.isActive,
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

function parsePassword(value: unknown): string {
  const password = String(value ?? "");
  if (password.length < MIN_PASSWORD) {
    throw new CustomError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`, 400);
  }
  return password;
}

export async function listUsers(): Promise<StaffUserDto[]> {
  const users = await User.find().sort({ createdAt: 1 });
  return users.map(serializeUser);
}

export async function createUser(body: Record<string, unknown>): Promise<StaffUserDto> {
  const input = body ?? {};

  const name = cleanText(input.name, 120);
  if (!name) throw new CustomError("Escribe el nombre", 400);

  const email = cleanText(input.email, 200).toLowerCase();
  if (!EMAIL.test(email)) throw new CustomError("Correo inválido", 400);

  const password = parsePassword(input.password);
  const accountType = parseEnum(input.accountType ?? "staff", ACCOUNT_TYPES, "Tipo de cuenta");

  if (await User.exists({ email })) {
    throw new CustomError("Ya existe una cuenta con ese correo", 409);
  }

  try {
    const user = await User.create({
      name,
      email,
      password,
      phone: cleanText(input.phone, 30),
      accountType,
    });
    return serializeUser(user);
  } catch (error: any) {
    if (error?.code === 11000) throw new CustomError("Ya existe una cuenta con ese correo", 409);
    throw error;
  }
}

export async function updateUser(
  id: unknown,
  body: Record<string, unknown>,
  currentUserId: string,
): Promise<StaffUserDto> {
  const input = body ?? {};
  const userId = assertObjectId(id, NOT_FOUND);

  const user = await User.findById(userId).select("+password");
  if (!user) throw new CustomError(NOT_FOUND, 404);

  const isSelf = user._id.toString() === currentUserId;

  if (input.name !== undefined) {
    const name = cleanText(input.name, 120);
    if (!name) throw new CustomError("Escribe el nombre", 400);
    user.name = name;
  }
  if (input.phone !== undefined) user.phone = cleanText(input.phone, 30);

  if (input.accountType !== undefined) {
    const accountType = parseEnum(input.accountType, ACCOUNT_TYPES, "Tipo de cuenta");
    // Si el único admin se quita el rol, nadie más puede devolvérselo.
    if (isSelf && accountType !== "admin") {
      throw new CustomError("No puedes quitarte el rol de administrador a ti mismo", 400);
    }
    user.accountType = accountType;
  }

  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") {
      throw new CustomError("Estado de la cuenta: valor no permitido", 400);
    }
    if (isSelf && !input.isActive) {
      throw new CustomError("No puedes desactivar tu propia cuenta", 400);
    }
    user.isActive = input.isActive;
  }

  // Asignar + save() para que corra el hook que hashea la contraseña.
  if (input.password !== undefined && input.password !== "") {
    user.password = parsePassword(input.password);
  }

  await user.save();
  return serializeUser(user);
}
