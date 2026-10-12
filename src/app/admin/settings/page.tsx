import AdminNav from "@/components/admin/AdminNav";
import SettingsForm from "@/components/admin/SettingsForm";
import { adminPage } from "@/lib/adminGuard";
import { getSettings, getSimulatorSettings } from "@/lib/settings";
import { PARTS } from "@/lib/catalog/parts";
import { COLORS } from "@/lib/catalog/colors";

export default async function AdminSettings() {
  await adminPage();
  const [settings, sim] = await Promise.all([getSettings(), getSimulatorSettings()]);
  return (
    <div className="stack">
      <h1>Limits, simulator and mappings</h1>
      <AdminNav />
      <SettingsForm settings={settings} sim={sim} parts={Object.values(PARTS).map((p) => ({ id: p.id, name: p.name, bl: p.bricklinkId }))} colors={Object.values(COLORS).map((c) => ({ id: c.id, name: c.name, bl: c.bricklinkColorId }))} />
    </div>
  );
}
