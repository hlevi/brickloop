import Editor from "@/components/Editor";

export default async function DesignPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <Editor designId={id} />;
}
