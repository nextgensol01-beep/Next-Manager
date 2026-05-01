import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";

// GET /api/users — list all managed users
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const users = await User.find({})
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    users: users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      loginMethod: u.googleId ? "google" : "password",
      image: u.image || null,
      createdAt: u.createdAt,
    })),
  });
}

// POST /api/users — add a new user
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const body = await req.json();
  const { name, email, loginMethod, password } = body as {
    name: string;
    email: string;
    loginMethod: "google" | "password";
    password?: string;
  };

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (loginMethod === "password" && !password?.trim()) {
    return NextResponse.json({ error: "Password is required for password login" }, { status: 400 });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const user = new User({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    googleId: loginMethod === "google" ? email.toLowerCase().trim() : null,
    password: loginMethod === "password" ? password : undefined,
  });

  await user.save();

  return NextResponse.json({
    id: String(user._id),
    name: user.name,
    email: user.email,
    loginMethod,
    createdAt: user.createdAt,
  }, { status: 201 });
}

// DELETE /api/users?id=xxx — remove a user
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await User.findByIdAndDelete(id);
  return NextResponse.json({ deleted: 1 });
}

// PATCH /api/users?id=xxx — update name or reset password
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const body = await req.json();
  const { name, password } = body as { name?: string; password?: string };

  const user = await User.findById(id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (name?.trim()) user.name = name.trim();
  if (password?.trim()) user.password = password.trim(); // pre-save hook hashes it

  await user.save();
  return NextResponse.json({ ok: true });
}
