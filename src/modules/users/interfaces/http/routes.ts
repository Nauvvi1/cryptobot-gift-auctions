import { Express, Request, Response } from "express";
import { asyncHandler } from "../../../../common/asyncHandler";
import { asString } from "../../../../common/validate";
import { createUser, getUser } from "../../application/userService";

export function registerUserRoutes(app: Express) {
  app.post("/api/users", asyncHandler(async (req: Request, res: Response) => {
    const name = req.body?.name ? asString(req.body.name, "name", 80) : undefined;
    const user = await createUser(name);
    res.json({ user });
  }));

  app.get("/api/users/:id", asyncHandler(async (req: Request, res: Response) => {
    const id = asString(req.params.id, "id", 40);
    const user = await getUser(id);
    res.json({ user });
  }));
}
