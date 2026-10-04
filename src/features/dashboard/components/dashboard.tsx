"use client";

import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  KanbanIcon,
  HouseIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PlugsConnectedIcon,
  UsersIcon,
  UserIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AccountMenu } from "@/features/account/components/account-menu";
import type { SettingsSection } from "@/features/account/components/account-settings";
import { useSession } from "@/features/auth/client/queries";
import { useDefaultDocumentSort } from "@/features/account/preferences";
const AccountSettings = dynamic(
  () => import("@/features/account/components/account-settings"),
);
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxTrigger,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import {
  filterDecisions,
  type Decision,
  type DecisionStatus,
} from "@/features/dashboard/data";
import {
  useDashboard,
  useDashboardAction,
} from "@/features/dashboard/client/queries";
import type { Person } from "@/features/dashboard/contracts";
import { useRecentDocuments } from "@/features/dashboard/client/recent-documents";
import {
  dashboardPaths,
  dashboardRoute,
  documentPath,
  projectPath,
} from "@/features/dashboard/routes";
import { ProjectActionsMenu } from "./project-actions-menu";
import { projectFolderColors } from "../project-folder-colors";
import { OrganizationAvatar } from "./organization-avatar";
import { DocumentEditor } from "./document-editor";
import { DocumentActionsMenu } from "./document-actions-menu";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ProjectChat } from "@/features/project-chat/components/project-chat";
import { ProjectChatList } from "@/features/project-chat/components/project-chat-list";
import { useCreateProjectChat } from "@/features/project-chat/client/queries";
import { projectChatPath } from "@/features/project-chat/contracts";

const statuses = ["Draft", "Published"];
function documentCount(count: number) {
  return `${count} ${count === 1 ? "document" : "documents"}`;
}

function PersonAvatar({
  person,
  className,
}: {
  person: Person;
  className?: string;
}) {
  return (
    <Avatar
      className={cn("size-6 ring-2 ring-background", className)}
      title={person.name}
    >
      <AvatarImage src={person.picture || undefined} alt={person.name} />
      <AvatarFallback>{person.initials}</AvatarFallback>
    </Avatar>
  );
}

function Status({ status }: { status: DecisionStatus }) {
  return (
    <Badge
      variant={
        status === "Published"
          ? "success"
          : status === "In review"
            ? "warning"
            : "secondary"
      }
      className="decision-status"
    >
      {status === "Published" ? (
        <CheckCircleIcon aria-hidden="true" />
      ) : status === "In review" ? (
        <ClockIcon aria-hidden="true" />
      ) : (
        <span className="draft-dot" aria-hidden="true" />
      )}
      {status}
    </Badge>
  );
}

function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="outline" className="filter-button" />}
        aria-label={`${label}: ${value}`}
      >
        {value === options[0] && label !== "Sort" ? label : value}
        <CaretDownIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>{label}</MenuGroupLabel>
          <MenuRadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <MenuRadioItem key={option} value={option} closeOnClick>
                {option}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function MultiFilter({
  compact = false,
  labelFor = (value) => value,
  label,
  values,
  options,
  onChange,
}: {
  compact?: boolean;
  labelFor?: (value: string) => string;
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <Combobox
      multiple
      items={options}
      itemToStringLabel={labelFor}
      value={values}
      onValueChange={onChange}
    >
      <ComboboxChips
        className={cn("dashboard-multi-select", compact && "compact-filter")}
      >
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.map((value) => (
                <ComboboxChip
                  key={value}
                  aria-label={value}
                  removeProps={{ "aria-label": `Remove ${value}` }}
                >
                  {labelFor(value)}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={`dashboard-${label.toLowerCase().replaceAll(" ", "-")}`}
                aria-label={label}
                placeholder={selected.length ? undefined : label}
                size={compact ? (selected.length ? 2 : label.length) : "sm"}
              />
            </>
          )}
        </ComboboxValue>
        {compact && (
          <ComboboxTrigger
            className="filter-picker-trigger"
            aria-label={`Show ${label.toLowerCase()} options`}
          >
            <CaretDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        )}
      </ComboboxChips>
      <ComboboxPopup
        className={compact ? "compact-filter-popup" : undefined}
        aria-label={`Select ${label.toLowerCase().replaceAll(" ", "-")}`}
      >
        <ComboboxEmpty>No matching options.</ComboboxEmpty>
        <ComboboxList>
          {(option: string) => (
            <ComboboxItem key={option} value={option}>
              {labelFor(option)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

export function Dashboard({
  settingsSection,
  githubOutcome,
  mcpEndpoint,
}: {
  settingsSection?: SettingsSection;
  githubOutcome?: string;
  mcpEndpoint?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const chatId =
    pathname.match(/^\/projects\/[^/]+\/chats\/([^/]+)$/)?.[1] || null;
  const { view, projectId, documentId: selectedId } = dashboardRoute(pathname);
  const session = useSession();
  const [defaultSort] = useDefaultDocumentSort(session.data?.user?.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  const workspace = useDashboard(
    session.data?.user?.id,
    session.data?.organizationId || null,
  );
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const mutation = useDashboardAction(session.data?.user?.id);
  const organization = workspace.data?.organizationId || "";
  const organizationName =
    workspace.data?.organizations.find((item) => item.id === organization)
      ?.name || "Choose organization";
  const projectRecords = workspace.data?.projects || [];
  const decisions = workspace.data?.documents || [];
  const people = workspace.data?.people || {};
  const projectName = (id: string | null) =>
    projectRecords.find((item) => item.id === id)?.name || "Project";
  const [organizationCreateOpen, setOrganizationCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectRepositories, setProjectRepositories] = useState<string[]>([]);
  const [creationProject, setCreationProject] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [project, setProject] = useState<string[]>([]);
  const [sortOverride, setSort] = useState<string | null>(null);
  const sort = sortOverride || defaultSort;
  const [recent, recordRecent] = useRecentDocuments(
    session.data?.user?.id,
    organization,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [myReviews, setMyReviews] = useState(false);
  const [documentActionsTarget, setDocumentActionsTarget] =
    useState<HTMLDivElement | null>(null);
  const orgDocuments = decisions.filter(
    (decision) => decision.organization === organization,
  );
  const selected = orgDocuments.find((decision) => decision.id === selectedId);
  const activeProject = projectId || selected?.project || null;
  const orgProjects = projectRecords.filter(
    (item) => item.organization === organization,
  );
  const projects = orgProjects.map((item) => item.id);
  const projectItems = projects.map((name) => ({
    label: projectName(name),
    value: name,
  }));
  const currentProject = orgProjects.find((item) => item.id === activeProject);
  const chatScope = {
    userId: session.data?.user?.id || "",
    organizationId: organization,
    projectId: activeProject || "",
  };
  const createChat = useCreateProjectChat(chatScope);
  async function startChat() {
    try {
      const chat = await createChat.mutateAsync();
      prepareNavigation();
      router.push(projectChatPath(chatScope.projectId, chat.id));
    } catch {
      /* The project section shows the creation error. */
    }
  }
  const projectIsEmpty =
    Boolean(activeProject) &&
    !orgDocuments.some((document) => document.project === activeProject);
  const selectedRepositories =
    selected?.repositories ??
    orgProjects.find((item) => item.id === selected?.project)?.repositories ??
    [];
  const recentDocuments = recent
    .map((id) => orgDocuments.find((decision) => decision.id === id))
    .filter((decision): decision is Decision => Boolean(decision));
  const frequentProjects = [...projects].sort(
    (a, b) =>
      recentDocuments.filter((document) => document.project === b).length -
      recentDocuments.filter((document) => document.project === a).length,
  );
  const filtered = filterDecisions(decisions, {
    organization,
    query,
    status,
    project,
    myReviews,
    scope: activeProject,
    sort,
    people,
    userId: session.data?.user?.id,
  });

  const openedDocumentId = selected?.id;
  const recordOpenedDocument = useEffectEvent(recordRecent);
  useEffect(() => {
    if (openedDocumentId) recordOpenedDocument(openedDocumentId);
  }, [openedDocumentId, organization]);

  async function switchOrganization(organizationId: string) {
    setSwitchError(null);
    setSwitching(true);
    try {
      const result = await apiClient<{
        organizationId?: string;
        redirectUrl?: string;
      }>("/api/auth/organization", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      });
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
      else window.location.assign(settingsSection ? window.location.href : "/");
    } catch (error) {
      setSwitchError((error as Error).message);
      setSwitching(false);
    }
  }
  function startDocument() {
    if (!projects.length) {
      startProject();
      return;
    }
    setFormError(null);
    const name = activeProject || project[0] || projects[0];
    setCreationProject(name);
    setCreateOpen(true);
  }
  function prepareNavigation() {
    scrollRef.current?.scrollTo({ top: 0 });
    setMyReviews(false);
    setQuery("");
    setStatus([]);
    setProject([]);
    setMobileOpen(false);
  }
  function openProject(name: string) {
    prepareNavigation();
    router.push(projectPath(name));
  }
  function openDocument(id: string) {
    prepareNavigation();
    router.push(documentPath(id));
  }
  // Opens a shared `/?document=<id>` link once the document list has loaded.
  const linkedDocument = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!workspace.data) return;
    linkedDocument.current ??= new URLSearchParams(window.location.search).get(
      "document",
    );
    const id = linkedDocument.current;
    if (!id) return;
    linkedDocument.current = "";
    if (workspace.data.documents.some((document) => document.id === id))
      openDocument(id);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.data]);
  function resetFilters() {
    setMyReviews(false);
    setQuery("");
    setStatus([]);
    setProject([]);
  }
  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const fields = new FormData(event.currentTarget);
    try {
      const doc = await mutation.mutateAsync({
        action: "createDocument",
        organizationId: organization,
        projectId: creationProject,
        title: String(fields.get("title")),
        description: String(fields.get("description")),
      });
      setCreateOpen(false);
      openDocument(doc.id);
    } catch (error) {
      setFormError((error as Error).message);
    }
  }
  function startProject() {
    setFormError(null);
    setProjectRepositories([]);
    setProjectCreateOpen(true);
  }
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const fields = new FormData(event.currentTarget);
    if (!projectRepositories.length) {
      setFormError("Choose at least one repository for this project.");
      return;
    }
    const repositories = projectRepositories.map((slug) =>
      workspace.data?.repositories.find(
        (repo) => `${repo.owner}/${repo.name}` === slug,
      ),
    );
    if (repositories.some((repository) => !repository)) {
      setFormError("Choose connected GitHub repositories. Refresh the page.");
      return;
    }
    try {
      const result = await mutation.mutateAsync({
        action: "createProject",
        organizationId: organization,
        name: String(fields.get("name")),
        description: String(fields.get("description")),
        repositoryIds: repositories.map((repository) => repository!.id),
      });
      setProjectCreateOpen(false);
      openProject(result.id);
    } catch (error) {
      setFormError((error as Error).message);
    }
  }
  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const fields = new FormData(event.currentTarget);
    try {
      const result = await mutation.mutateAsync({
        action: "createOrganization",
        name: String(fields.get("name")),
      });
      await switchOrganization(result.id);
      setOrganizationCreateOpen(false);
    } catch (error) {
      setFormError((error as Error).message);
    }
  }

  const sidebar = (
    <div className="dashboard-sidebar-content">
      <div className="org-row">
        <Menu>
          <Tooltip>
            <MenuTrigger
              render={
                <TooltipTrigger
                  render={<Button variant="ghost" className="org-switcher" />}
                />
              }
              aria-label="Switch organization"
            >
              <span className="org-mark" aria-hidden="true">
                <OrganizationAvatar organizationId={organization} />
              </span>
              <span className="sidebar-label truncate">{organizationName}</span>
              <CaretUpDownIcon aria-hidden="true" />
            </MenuTrigger>
            <TooltipPopup side="right" sideOffset={12}>
              Switch organization: {organizationName}
            </TooltipPopup>
          </Tooltip>
          <MenuPopup align="start" className="w-60">
            <MenuGroup>
              <MenuGroupLabel>Organizations</MenuGroupLabel>
              {workspace.data?.organizations.map((org) => (
                <MenuItem
                  key={org.id}
                  disabled={switching}
                  onClick={() => switchOrganization(org.id)}
                >
                  <span className="org-mark" aria-hidden="true">
                    <OrganizationAvatar organizationId={org.id} />
                  </span>
                  <span className="flex-1">{org.name}</span>
                  {organization === org.id && <CheckIcon aria-hidden="true" />}
                </MenuItem>
              ))}
              <MenuItem
                disabled={!session.data?.user}
                onClick={() => {
                  setFormError(null);
                  setOrganizationCreateOpen(true);
                }}
              >
                <PlusIcon aria-hidden="true" />
                New organization
              </MenuItem>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
      {switchError && (
        <p role="alert" className="px-3 text-sm text-destructive">
          {switchError}
        </p>
      )}
      {settingsSection ? (
        <>
          <Button
            variant="ghost"
            className="sidebar-item back-to-app"
            render={<Link href="/" />}
            aria-label="Back to app"
            title="Back to app"
          >
            <ArrowLeftIcon aria-hidden="true" />
            <span className="sidebar-label">Back to app</span>
          </Button>
          {[
            {
              category: "Personal",
              items: [
                { section: "profile", label: "Profile", icon: UserIcon },
                {
                  section: "security",
                  label: "Security",
                  icon: ShieldCheckIcon,
                },
                { section: "mcp", label: "MCP", icon: PlugsConnectedIcon },
                {
                  section: "preferences",
                  label: "Preferences",
                  icon: SlidersHorizontalIcon,
                },
              ],
            },
            {
              category: "Team",
              items: [
                { section: "team", label: "Team", icon: UsersIcon },
                { section: "github", label: "GitHub", icon: GitBranchIcon },
                { section: "linear", label: "Linear", icon: KanbanIcon },
              ],
            },
          ].map(({ category, items }) => (
            <div key={category} className="sidebar-section settings-section">
              <h2>{category}</h2>
              <nav aria-label={`${category} settings`}>
                {items.map(({ section, label, icon: Icon }) => (
                  <Tooltip key={section}>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          className={cn(
                            "sidebar-item",
                            settingsSection === section &&
                              "sidebar-item-active",
                          )}
                          render={<Link href={`/settings/${section}`} />}
                          aria-current={
                            settingsSection === section ? "page" : undefined
                          }
                          aria-label={label}
                        >
                          <Icon aria-hidden="true" />
                          <span className="sidebar-label">{label}</span>
                        </Button>
                      }
                    />
                    <TooltipPopup side="right" sideOffset={12}>
                      {label}
                    </TooltipPopup>
                  </Tooltip>
                ))}
              </nav>
            </div>
          ))}
        </>
      ) : (
        <>
          <nav aria-label="Workspace" className="sidebar-navigation">
            {[
              {
                name: "Overview",
                icon: HouseIcon,
                href: dashboardPaths.Overview,
              },
              {
                name: "Projects",
                icon: FolderIcon,
                href: dashboardPaths.Projects,
              },
              {
                name: "Documents",
                icon: FileTextIcon,
                href: dashboardPaths.Documents,
              },
            ].map(({ name, icon: Icon, href }) => (
              <Tooltip key={name}>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      className={cn(
                        "sidebar-item",
                        view === name && "sidebar-item-active",
                      )}
                      render={
                        <Link href={href} onNavigate={prepareNavigation} />
                      }
                      aria-label={name}
                      aria-current={
                        view === name && !selectedId && !projectId
                          ? "page"
                          : undefined
                      }
                    >
                      <Icon
                        aria-hidden="true"
                        weight={view === name ? "fill" : "regular"}
                      />
                      <span className="sidebar-label">{name}</span>
                    </Button>
                  }
                />
                <TooltipPopup side="right" sideOffset={12}>
                  {name}
                </TooltipPopup>
              </Tooltip>
            ))}
          </nav>
          <div className="sidebar-section sidebar-shortcuts">
            <h2>Projects</h2>
            <nav aria-label="Projects">
              {projects.map((name) => (
                <Button
                  key={name}
                  variant="ghost"
                  className={cn(
                    "sidebar-item",
                    activeProject === name && "sidebar-item-active",
                  )}
                  render={
                    <Link
                      href={projectPath(name)}
                      onNavigate={prepareNavigation}
                    />
                  }
                  aria-current={
                    activeProject === name && !selectedId ? "page" : undefined
                  }
                  aria-label={projectName(name)}
                  title={projectName(name)}
                >
                  <FolderIcon
                    aria-hidden="true"
                    weight="fill"
                    className="project-folder-icon"
                    style={projectFolderColors(name)}
                  />
                  <span className="sidebar-label truncate">
                    {projectName(name)}
                  </span>
                  <span className="sidebar-count">
                    {
                      orgDocuments.filter(
                        (decision) => decision.project === name,
                      ).length
                    }
                  </span>
                </Button>
              ))}
            </nav>
          </div>
          {currentProject && !sidebarCollapsed && (
            <ProjectChatList
              scope={chatScope}
              activeId={chatId}
              compact
              onNavigate={prepareNavigation}
            />
          )}
          <div className="sidebar-section sidebar-shortcuts sidebar-recents">
            <h2>Recently viewed</h2>
            <nav aria-label="Recently viewed documents">
              {recentDocuments.length ? (
                recentDocuments.map((decision) => (
                  <Button
                    key={decision.id}
                    variant="ghost"
                    className={cn(
                      "sidebar-item",
                      selectedId === decision.id && "sidebar-item-active",
                    )}
                    render={
                      <Link
                        href={documentPath(decision.id)}
                        onNavigate={prepareNavigation}
                      />
                    }
                    aria-current={
                      selectedId === decision.id ? "page" : undefined
                    }
                    title={decision.title}
                    aria-label={decision.title}
                  >
                    <FileTextIcon aria-hidden="true" />
                    <span className="sidebar-label truncate">
                      {decision.title}
                    </span>
                  </Button>
                ))
              ) : (
                <p className="sidebar-empty">Documents you open appear here.</p>
              )}
            </nav>
          </div>
        </>
      )}
      <div className="sidebar-bottom">
        <AccountMenu />
      </div>
    </div>
  );

  return (
    <div className="dashboard-shell">
      <a className="dashboard-skip" href="#dashboard-main">
        Skip to content
      </a>
      <aside
        id="dashboard-sidebar"
        className="dashboard-sidebar"
        data-collapsed={sidebarCollapsed}
        aria-label="Sidebar"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="sidebar-collapse-toggle"
                aria-label={
                  sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
                aria-expanded={!sidebarCollapsed}
                aria-controls="dashboard-sidebar"
                onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              >
                {sidebarCollapsed ? (
                  <CaretRightIcon aria-hidden="true" />
                ) : (
                  <CaretLeftIcon aria-hidden="true" />
                )}
              </Button>
            }
          />
          <TooltipPopup side="right" sideOffset={12}>
            {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipPopup>
        </Tooltip>
        {sidebar}
      </aside>
      <main id="dashboard-main" className="dashboard-main">
        <header className="dashboard-topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-nav-toggle"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <ListIcon />
          </Button>
          {settingsSection ? (
            <nav aria-label="Breadcrumb">
              <ol className="dashboard-breadcrumb">
                <li>
                  <Link href="/">Workspace</Link>
                </li>
                <li className="breadcrumb-divider" aria-hidden="true">
                  /
                </li>
                <li>Settings</li>
                <li className="breadcrumb-divider" aria-hidden="true">
                  /
                </li>
                <li className="breadcrumb-current" aria-current="page">
                  {settingsSection === "team"
                    ? "Team settings"
                    : settingsSection === "github"
                      ? "GitHub"
                      : settingsSection === "mcp"
                        ? "MCP"
                        : settingsSection.charAt(0).toUpperCase() +
                          settingsSection.slice(1)}
                </li>
              </ol>
            </nav>
          ) : (
            <nav aria-label="Breadcrumb">
              <ol className="dashboard-breadcrumb">
                <li>
                  <Link
                    href={dashboardPaths.Overview}
                    onNavigate={prepareNavigation}
                  >
                    Workspace
                  </Link>
                </li>
                {activeProject || selected ? (
                  <>
                    <li className="breadcrumb-divider" aria-hidden="true">
                      /
                    </li>
                    <li>
                      <Link
                        href={dashboardPaths.Projects}
                        onNavigate={prepareNavigation}
                      >
                        Projects
                      </Link>
                    </li>
                    <li className="breadcrumb-divider" aria-hidden="true">
                      /
                    </li>
                    <li>
                      {selected ? (
                        <Link
                          href={projectPath(selected.project)}
                          onNavigate={prepareNavigation}
                        >
                          {projectName(selected.project)}
                        </Link>
                      ) : (
                        <span
                          className="breadcrumb-current"
                          aria-current="page"
                        >
                          {projectName(activeProject)}
                        </span>
                      )}
                    </li>
                    {selected && (
                      <>
                        <li className="breadcrumb-divider" aria-hidden="true">
                          /
                        </li>
                        <li
                          className="breadcrumb-current breadcrumb-document"
                          aria-current="page"
                        >
                          {selected.title}
                        </li>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <li className="breadcrumb-divider" aria-hidden="true">
                      /
                    </li>
                    <li className="breadcrumb-current" aria-current="page">
                      {view}
                    </li>
                  </>
                )}
              </ol>
            </nav>
          )}
          {selected && !settingsSection && session.data?.user && (
            <div className="dashboard-topbar-actions">
              <div
                className="document-publish-actions"
                ref={setDocumentActionsTarget}
              />
              <DocumentActionsMenu
                key={selected.id}
                id={selected.id}
                organizationId={organization}
                userId={session.data.user.id}
                title={selected.title}
                description={selected.description}
                onDeleted={() => router.push(projectPath(selected.project))}
              />
            </div>
          )}
        </header>
        <div
          className={cn(
            "dashboard-scroll",
            selected && !settingsSection && "dashboard-document-workspace",
          )}
          ref={scrollRef}
        >
          {settingsSection ? (
            ["github", "team", "linear"].includes(settingsSection) &&
            session.data?.user &&
            workspace.isPending ? (
              <div className="settings-content">
                <p role="status">Loading your organizations…</p>
              </div>
            ) : ["github", "team", "linear"].includes(settingsSection) &&
              workspace.isError ? (
              <div className="settings-content" role="alert">
                <p>{workspace.error.message}</p>
                <Button
                  variant="outline"
                  onClick={() => void workspace.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <AccountSettings
                section={settingsSection}
                organizationId={organization}
                githubOutcome={githubOutcome}
                mcpEndpoint={mcpEndpoint}
              />
            )
          ) : session.isPending ||
            (session.data?.user && workspace.isPending) ? (
            <div className="documents-empty" role="status">
              Loading your workspace…
            </div>
          ) : !session.data?.user ? (
            <div className="documents-empty">
              <h1>Your team’s decisions, together</h1>
              <p>Sign in to open your projects and documents.</p>
              <Button render={<Link href="/login" />}>Sign in</Button>
            </div>
          ) : workspace.isError ? (
            <div className="documents-empty" role="alert">
              <h1>Could not load your workspace</h1>
              <p>{workspace.error.message}</p>
              <Button onClick={() => workspace.refetch()}>Try again</Button>
            </div>
          ) : !organization && workspace.data?.organizations.length ? (
            <div className="documents-empty">
              <h1>Choose your organization</h1>
              <p>Open a workspace to see its projects and decisions.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {workspace.data.organizations.map((org) => (
                  <Button
                    key={org.id}
                    variant="outline"
                    disabled={switching}
                    onClick={() => switchOrganization(org.id)}
                  >
                    {org.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : !organization ? (
            <div className="documents-empty">
              <h1>Create your team’s workspace</h1>
              <p>
                Start with an organization, then group your decisions into
                projects.
              </p>
              <Button
                onClick={() => {
                  setFormError(null);
                  setOrganizationCreateOpen(true);
                }}
              >
                New organization
              </Button>
            </div>
          ) : (selectedId && !selected) || (projectId && !currentProject) ? (
            <div className="documents-empty">
              <h1>{selectedId ? "Document not found" : "Project not found"}</h1>
              <p>
                This item is unavailable in the current organization. Check the
                link or switch organizations.
              </p>
              <Button
                render={
                  <Link
                    href={
                      selectedId
                        ? dashboardPaths.Documents
                        : dashboardPaths.Projects
                    }
                  />
                }
              >
                {selectedId ? "Browse documents" : "Browse projects"}
              </Button>
            </div>
          ) : chatId && currentProject ? (
            <ProjectChat
              key={`${chatScope.userId}:${organization}:${chatId}`}
              scope={chatScope}
              id={chatId}
              projectName={currentProject.name}
            />
          ) : selected ? (
            <DocumentEditor
              key={`${organization}:${selected.id}`}
              id={selected.id}
              projectId={selected.project}
              organizationId={organization}
              userId={session.data!.user!.id}
              creator={people[selected.creator]}
              creatorId={selected.creator}
              repositories={selectedRepositories}
              title={selected.title}
              actionsTarget={documentActionsTarget}
            />
          ) : (
            <div className="dashboard-content">
              <div className="dashboard-heading">
                <h1>{activeProject ? projectName(activeProject) : view}</h1>
                {projects.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {currentProject && (
                      <Button
                        variant="outline"
                        disabled={createChat.isPending}
                        onClick={startChat}
                      >
                        <PlusIcon aria-hidden="true" /> New chat
                      </Button>
                    )}
                    <Button
                      disabled={mutation.isPending}
                      onClick={
                        view === "Projects" && !activeProject
                          ? startProject
                          : startDocument
                      }
                      className="new-document-button"
                    >
                      <PlusIcon aria-hidden="true" />
                      {view === "Projects" && !activeProject
                        ? "New project"
                        : "New document"}
                    </Button>
                  </div>
                )}
              </div>
              {currentProject && (
                <>
                  <ProjectChatList
                    scope={chatScope}
                    onNavigate={prepareNavigation}
                  />
                  {createChat.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {createChat.error.message}
                    </p>
                  )}
                </>
              )}
              {!projects.length && (
                <div className="first-project-empty">
                  <FolderIcon aria-hidden="true" />
                  <h2>Create your first project</h2>
                  <p>
                    Group the repositories that belong to one feature or
                    initiative. Then plan the work together.
                  </p>
                  <Button onClick={startProject}>
                    <PlusIcon aria-hidden="true" /> Create your first project
                  </Button>
                </div>
              )}
              {currentProject && (
                <div className="project-context">
                  {currentProject.description && (
                    <p>{currentProject.description}</p>
                  )}
                  <div className="project-repository-metadata">
                    <span className="project-repository-label">
                      <GitBranchIcon aria-hidden="true" />
                      Repositories
                    </span>
                    <div
                      className="project-repositories"
                      aria-label="Project repositories"
                    >
                      {currentProject.repositories.map((repository) => (
                        <a
                          key={repository}
                          href={`https://github.com/${repository}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {repository}
                          <ArrowUpRightIcon aria-hidden="true" />
                        </a>
                      ))}
                      {!currentProject.repositories.length && (
                        <span>No repositories linked</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {projects.length > 0 &&
                (view === "Overview" ||
                  (view === "Projects" && !activeProject)) && (
                  <section
                    className="projects-section"
                    aria-labelledby="projects-heading"
                  >
                    <div className="overview-section-heading">
                      <h2
                        id="projects-heading"
                        className={view === "Overview" ? "" : "sr-only"}
                      >
                        Projects
                      </h2>
                      {view === "Overview" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          render={
                            <Link
                              href={dashboardPaths.Projects}
                              onNavigate={prepareNavigation}
                            />
                          }
                        >
                          View all
                          <ArrowUpRightIcon aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    <div className="project-grid">
                      {(view === "Overview" ? frequentProjects : projects).map(
                        (name) => (
                          <div key={name} className="project-card-wrap">
                            <Link
                              href={projectPath(name)}
                              className={cn(
                                "project-card",
                                activeProject === name && "project-selected",
                              )}
                              onNavigate={prepareNavigation}
                            >
                              <div
                                className="folder-art"
                                style={projectFolderColors(name)}
                                aria-hidden="true"
                              >
                                <div className="folder-back" />
                                <div className="folder-paper paper-back">
                                  <i />
                                  <i />
                                  <i />
                                </div>
                                <div className="folder-paper paper-front">
                                  <i />
                                  <i />
                                  <i />
                                </div>
                                <div className="folder-flap">
                                  <span className="folder-seam" />
                                </div>
                              </div>
                              <div className="project-card-label">
                                <span>
                                  <strong>{projectName(name)}</strong>
                                  <small className="project-description">
                                    {
                                      orgProjects.find(
                                        (item) => item.id === name,
                                      )?.description
                                    }
                                  </small>
                                  <small className="project-document-count">
                                    {documentCount(
                                      orgDocuments.filter(
                                        (decision) => decision.project === name,
                                      ).length,
                                    )}
                                  </small>
                                </span>
                                <ArrowUpRightIcon aria-hidden="true" />
                              </div>
                            </Link>
                            <ProjectActionsMenu
                              className="project-card-menu"
                              id={name}
                              organizationId={organization}
                              userId={session.data!.user!.id}
                              name={projectName(name)}
                              description={
                                orgProjects.find((item) => item.id === name)
                                  ?.description ?? ""
                              }
                              documentCount={
                                orgDocuments.filter(
                                  (decision) => decision.project === name,
                                ).length
                              }
                              onDeleted={() => {
                                if (activeProject === name)
                                  router.push(dashboardPaths.Projects);
                              }}
                            />
                          </div>
                        ),
                      )}
                    </div>
                  </section>
                )}
              {projects.length > 0 &&
                (view === "Overview" ||
                  view === "Documents" ||
                  activeProject) && (
                  <section
                    className="documents-section"
                    aria-labelledby="documents-heading"
                  >
                    <div className="overview-section-heading">
                      <h2
                        id="documents-heading"
                        className={view === "Overview" ? "" : "sr-only"}
                      >
                        {view === "Overview" ? "Recently viewed" : "Documents"}
                      </h2>
                      {view === "Overview" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          render={
                            <Link
                              href={dashboardPaths.Documents}
                              onNavigate={prepareNavigation}
                            />
                          }
                        >
                          View all documents
                          <ArrowUpRightIcon aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    {view !== "Overview" && (
                      <div className="document-toolbar">
                        <div className="document-search">
                          <MagnifyingGlassIcon aria-hidden="true" />
                          <Input
                            type="search"
                            aria-label="Search documents"
                            placeholder="Search documents…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                          />
                        </div>
                        <div className="document-filters">
                          <Button
                            variant={myReviews ? "secondary" : "outline"}
                            className="filter-button"
                            disabled
                            title="Review requests are not available yet"
                            aria-pressed={myReviews}
                            onClick={() => setMyReviews(!myReviews)}
                          >
                            <CheckCircleIcon aria-hidden="true" />
                            My reviews
                          </Button>
                          <MultiFilter
                            compact
                            label="Status"
                            values={status}
                            options={statuses}
                            onChange={setStatus}
                          />
                          {!activeProject && (
                            <MultiFilter
                              compact
                              label="Project"
                              values={project}
                              options={projects}
                              labelFor={(id) => projectName(id)}
                              onChange={setProject}
                            />
                          )}
                          <FilterMenu
                            label="Sort"
                            value={sort}
                            options={["Last updated", "Name"]}
                            onChange={setSort}
                          />
                        </div>
                      </div>
                    )}
                    <div className="document-list">
                      <div
                        className="document-table-heading"
                        aria-hidden="true"
                      >
                        <span>Document</span>
                        <span>Status</span>
                        <span>Created by</span>
                        <span>Reviewers</span>
                        <span>Updated</span>
                        <span />
                      </div>
                      {(view === "Overview" ? recentDocuments : filtered).map(
                        (decision) => (
                          <div className="document-row" key={decision.id}>
                            <Link
                              href={documentPath(decision.id)}
                              className="document-title-cell"
                              onNavigate={prepareNavigation}
                            >
                              <FileTextIcon aria-hidden="true" />
                              <span>
                                <strong>{decision.title}</strong>
                                <small>
                                  {decision.description || "No description yet"}
                                </small>
                              </span>
                            </Link>
                            <div className="document-status-cell">
                              <Status status={decision.status} />
                            </div>
                            <div className="document-creator-cell">
                              <PersonAvatar person={people[decision.creator]} />
                              <span>
                                {people[decision.creator].name.split(" ")[0]}
                              </span>
                            </div>
                            <div
                              className="document-reviewers-cell"
                              aria-label={`Requested reviewers: ${decision.reviewers.map((id) => people[id].name).join(", ") || "None"}`}
                            >
                              {decision.reviewers.length ? (
                                <div className="reviewer-stack">
                                  {decision.reviewers.map((id) => (
                                    <PersonAvatar
                                      key={id}
                                      person={people[id]}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                            <time
                              className="document-updated-cell"
                              dateTime={decision.updated}
                            >
                              {new Intl.DateTimeFormat("en", {
                                month: "short",
                                day: "numeric",
                                timeZone: "America/Edmonton",
                              }).format(new Date(decision.updated))}
                            </time>
                            {session.data?.user && (
                              <div className="document-actions-cell">
                                <DocumentActionsMenu
                                  id={decision.id}
                                  organizationId={organization}
                                  userId={session.data.user.id}
                                  title={decision.title}
                                  description={decision.description}
                                  onDeleted={() => {
                                    if (selectedId === decision.id)
                                      router.push(dashboardPaths.Documents);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ),
                      )}
                      {(view === "Overview"
                        ? recentDocuments.length
                        : filtered.length) === 0 && (
                        <div className="documents-empty">
                          <FileTextIcon aria-hidden="true" />
                          <h3>
                            {view === "Overview"
                              ? orgDocuments.length
                                ? "No recently viewed documents"
                                : "Create your first document"
                              : projectIsEmpty
                                ? "No documents yet"
                                : "No matching documents"}
                          </h3>
                          <p>
                            {view === "Overview"
                              ? orgDocuments.length
                                ? "Open a document to pick up your work here."
                                : "Name your plan, choose a project, and talk it through."
                              : projectIsEmpty
                                ? "Create the first decision for this project."
                                : "Try another search or clear the filters."}
                          </p>
                          <Button
                            variant="outline"
                            render={
                              view === "Overview" && orgDocuments.length ? (
                                <Link
                                  href={dashboardPaths.Documents}
                                  onNavigate={prepareNavigation}
                                />
                              ) : undefined
                            }
                            onClick={
                              view === "Overview"
                                ? orgDocuments.length
                                  ? undefined
                                  : startDocument
                                : projectIsEmpty
                                  ? startDocument
                                  : resetFilters
                            }
                          >
                            {view === "Overview"
                              ? orgDocuments.length
                                ? "Browse documents"
                                : "Create document"
                              : projectIsEmpty
                                ? "New document"
                                : "Clear search & filters"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="document-list-footer">
                      <span role="status">
                        {view === "Overview" ? (
                          `${recentDocuments.length} recently viewed documents`
                        ) : (
                          <>
                            {filtered.length} of{" "}
                            {activeProject
                              ? orgDocuments.filter(
                                  (decision) =>
                                    decision.project === activeProject,
                                ).length
                              : orgDocuments.length}{" "}
                            documents
                          </>
                        )}
                      </span>
                      <span>
                        <UsersIcon aria-hidden="true" />
                        Shared with your team
                      </span>
                    </div>
                  </section>
                )}
            </div>
          )}
        </div>
      </main>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPopup className="dashboard-mobile-popup">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          {sidebar}
        </DialogPopup>
      </Dialog>
      <Dialog
        open={organizationCreateOpen}
        onOpenChange={setOrganizationCreateOpen}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>New organization</DialogTitle>
            <DialogDescription>
              Create a workspace for your team’s projects and decisions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createOrganization}>
            <DialogPanel>
              <Label htmlFor="organization-name">Name</Label>
              <Input
                id="organization-name"
                name="name"
                required
                maxLength={80}
              />
            </DialogPanel>
            {formError && (
              <p role="alert" className="px-6 text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                Create organization
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>
              Name the plan and choose its project. The conversation starts
              next.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createDocument}>
            <DialogPanel className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="document-name">Name</Label>
                <Input
                  id="document-name"
                  name="title"
                  required
                  maxLength={180}
                  placeholder="e.g. PostgreSQL as our primary datastore"
                  onChange={(event) =>
                    event.currentTarget.setCustomValidity("")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-description">
                  Description (optional)
                </Label>
                <Textarea
                  id="document-description"
                  name="description"
                  placeholder="What decision is the team making?"
                  maxLength={1000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-project">Project</Label>
                <Select
                  name="project"
                  items={projectItems}
                  value={creationProject}
                  onValueChange={(name) => {
                    if (!name) return;
                    setCreationProject(name);
                  }}
                  required
                >
                  <SelectTrigger id="document-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {projects.map((name) => (
                      <SelectItem key={name} value={name}>
                        {projectName(name)}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            </DialogPanel>
            {formError && (
              <p role="alert" className="px-6 text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create document"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
      <Dialog open={projectCreateOpen} onOpenChange={setProjectCreateOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Group the repositories that make up a feature or initiative. A
              project can contain a monorepo, or several related repositories.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createProject}>
            <DialogPanel className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="e.g. Frontend or Billing"
                  onChange={(event) =>
                    event.currentTarget.setCustomValidity("")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  name="description"
                  maxLength={1000}
                  placeholder="What does this project cover?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dashboard-project-repositories">
                  Repositories
                </Label>
                {workspace.data?.repositories.length ? (
                  <MultiFilter
                    label="Project repositories"
                    values={projectRepositories}
                    options={workspace.data.repositories.map(
                      (repo) => `${repo.owner}/${repo.name}`,
                    )}
                    onChange={setProjectRepositories}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No connected repositories. Connect repositories with GitHub
                    before creating a project.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Only connected GitHub repositories can be selected.
                  Repositories can belong to more than one project.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  render={
                    <Link
                      href={`/settings/github?organizationId=${organization}`}
                    />
                  }
                >
                  Connect repositories with GitHub
                </Button>
              </div>
            </DialogPanel>
            {formError && (
              <p role="alert" className="px-6 text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={mutation.isPending || !projectRepositories.length}
              >
                {mutation.isPending ? "Creating…" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
