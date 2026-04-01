import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Trash2, Video, MapPin, Link as LinkIcon, Coffee, HelpCircle, Laptop, PartyPopper, PenLine } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface EventFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  memberId: string;
  event?: any;
}

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "(GMT -03:00) America/Sao Paulo" },
  { value: "America/New_York", label: "(GMT -05:00) America/New York" },
  { value: "America/Chicago", label: "(GMT -06:00) America/Chicago" },
  { value: "America/Los_Angeles", label: "(GMT -08:00) America/Los Angeles" },
  { value: "Europe/London", label: "(GMT +00:00) Europe/London" },
  { value: "Europe/Lisbon", label: "(GMT +00:00) Europe/Lisbon" },
  { value: "Europe/Berlin", label: "(GMT +01:00) Europe/Berlin" },
];

const DURATIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1h 30min" },
  { value: "120", label: "2 horas" },
  { value: "180", label: "3 horas" },
  { value: "240", label: "4 horas" },
];

const HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value: `${String(h).padStart(2, "0")}:${m}`, label: `${h12}:${m}${ampm}` };
});

const LOCATION_TYPES = [
  { value: "zoom", label: "Zoom", icon: Video },
  { value: "meet", label: "Meet", icon: Video },
  { value: "address", label: "Address", icon: MapPin },
  { value: "link", label: "Link", icon: LinkIcon },
];

const REPEAT_INTERVALS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
];

const REPEAT_UNITS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EVENT_TEMPLATES = [
  {
    key: "coffee",
    label: "Coffee hour",
    icon: Coffee,
    title: "Coffee hour",
    description: "Casual hangout — grab your favorite drink and let's chat!",
    duration: "60",
    locationType: "zoom",
  },
  {
    key: "qa",
    label: "Q&A",
    icon: HelpCircle,
    title: "Q&A",
    description: "Ask me anything! Bring your questions and let's dive in.",
    duration: "60",
    locationType: "zoom",
  },
  {
    key: "coworking",
    label: "Co-working session",
    icon: Laptop,
    title: "Co-working session",
    description: "Work together in real-time. Stay focused, stay connected.",
    duration: "120",
    locationType: "zoom",
  },
  {
    key: "happy",
    label: "Happy hour",
    icon: PartyPopper,
    title: "Happy hour",
    description: "Relax, socialize and celebrate wins with the community!",
    duration: "60",
    locationType: "zoom",
  },
  {
    key: "custom",
    label: "Create my own event",
    icon: PenLine,
    title: "",
    description: "",
    duration: "",
    locationType: "zoom",
  },
];

const TEMPLATE_SUGGESTIONS = [
  { label: "coffee hour", title: "Coffee hour" },
  { label: "Q&A", title: "Q&A" },
  { label: "co-working session", title: "Co-working session" },
  { label: "happy hour", title: "Happy hour" },
];

function detectPlatform(url: string): string | null {
  if (!url) return null;
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "zoom";
  if (url.includes("meet.google.com")) return "google_meet";
  if (url.includes("teams.microsoft.com")) return "teams";
  return "custom";
}

export default function EventFormModal({ open, onOpenChange, communityId, memberId, event }: EventFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!event;

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [isRecurring, setIsRecurring] = useState(false);
  const [repeatEvery, setRepeatEvery] = useState("1");
  const [repeatUnit, setRepeatUnit] = useState("week");
  const [repeatDays, setRepeatDays] = useState<string[]>([]);
  const [endType, setEndType] = useState<"never" | "on" | "after">("never");
  const [endDate, setEndDate] = useState("");
  const [endAfter, setEndAfter] = useState("10");
  const [locationType, setLocationType] = useState("zoom");
  const [locationValue, setLocationValue] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [accessRule, setAccessRule] = useState("all_members");
  const [accessValue, setAccessValue] = useState("");
  const [remindEmail, setRemindEmail] = useState(false);
  const [step, setStep] = useState<"template" | "form">("template");
  // Fetch tiers for access dropdown
  const { data: tiers = [] } = useQuery({
    queryKey: ["community-tiers-for-events", communityId],
    queryFn: async () => {
      if (!communityId) return [];
      const { data } = await supabase
        .from("community_tiers")
        .select("id, name")
        .eq("community_id", communityId)
        .eq("is_active", true)
        .order("sort_order");
      return data || [];
    },
    enabled: !!communityId && open,
  });

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setDescription(event.description || "");
      const startDate = event.starts_at ? new Date(event.starts_at) : new Date();
      setDate(format(startDate, "yyyy-MM-dd"));
      setTime(format(startDate, "HH:mm"));
      setDuration(event.duration_minutes?.toString() || "60");
      setTimezone(event.timezone || "America/Sao_Paulo");
      setIsRecurring(event.is_recurring || false);
      setLocationType(event.location_type || "zoom");
      setLocationValue(event.location_value || event.meeting_url || "");
      setCoverImage(event.cover_image_url || null);
      setAccessRule(event.access_rule || "all_members");
      setAccessValue(event.access_value || "");
      setRemindEmail(!!event.remind_email_before);
    } else {
      setTitle("");
      setDescription("");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTime("");
      setDuration("");
      setTimezone("America/Sao_Paulo");
      setIsRecurring(false);
      setRepeatEvery("1");
      setRepeatUnit("week");
      setRepeatDays([]);
      setEndType("never");
      setEndDate("");
      setEndAfter("10");
      setLocationType("zoom");
      setLocationValue("");
      setCoverImage(null);
      setAccessRule("all_members");
      setAccessValue("");
      setRemindEmail(false);
    }
  }, [event, open]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `events/${communityId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("community").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
      setCoverImage(urlData.publicUrl);
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const toggleWeekday = (day: string) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Build recurrence_rule JSON
  const buildRecurrenceRule = () => {
    if (!isRecurring) return null;
    return JSON.stringify({
      every: parseInt(repeatEvery),
      unit: repeatUnit,
      days: repeatDays,
      end: endType,
      endDate: endType === "on" ? endDate : null,
      endAfter: endType === "after" ? parseInt(endAfter) : null,
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Título obrigatório");
      if (!date) throw new Error("Data obrigatória");

      const startsAt = time ? new Date(`${date}T${time}:00`) : new Date(`${date}T00:00:00`);
      const durationMin = duration ? parseInt(duration) : null;
      const endsAt = durationMin
        ? new Date(startsAt.getTime() + durationMin * 60000)
        : null;

      const platform = locationType === "zoom" ? "zoom"
        : locationType === "meet" ? "google_meet"
        : locationType === "link" ? "custom"
        : null;

      const meetingUrl = (locationType !== "address" && locationValue.trim()) ? locationValue.trim() : null;

      const payload: any = {
        community_id: communityId,
        created_by: memberId,
        title: title.trim(),
        description: description.trim() || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt?.toISOString() || null,
        is_all_day: false,
        timezone,
        meeting_url: meetingUrl,
        meeting_platform: platform,
        cover_image_url: coverImage,
        is_recurring: isRecurring,
        recurrence_rule: buildRecurrenceRule(),
        location_type: locationType,
        location_value: locationValue.trim() || null,
        duration_minutes: durationMin,
        access_rule: accessRule,
        access_value: accessRule !== "all_members" ? accessValue : null,
        remind_email_before: remindEmail ? 1440 : null, // 1 day in minutes
      };

      if (isEditing) {
        const { error } = await supabase.from("community_events").update(payload).eq("id", event.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_events").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-events"] });
      onOpenChange(false);
      toast.success(isEditing ? "Evento atualizado!" : "Evento criado!");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao salvar evento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!event) return;
      await supabase.from("community_events").delete().eq("id", event.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-events"] });
      onOpenChange(false);
      toast.success("Evento excluído");
    },
  });

  const locationPlaceholder = useMemo(() => {
    if (locationType === "zoom") return "https://zoom.us/j/...";
    if (locationType === "meet") return "https://meet.google.com/...";
    if (locationType === "address") return "Endereço do local";
    return "https://...";
  }, [locationType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {isEditing ? "Edit event" : "Add event"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Need ideas? Try one of these fun formats:{" "}
              {TEMPLATE_SUGGESTIONS.map((t, i) => (
                <span key={t.label}>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setTitle(t.title)}
                  >
                    {t.label}
                  </button>
                  {i < TEMPLATE_SUGGESTIONS.length - 1 && (i === TEMPLATE_SUGGESTIONS.length - 2 ? ", or " : ", ")}
                </span>
              ))}
            </p>
          </div>

          {/* Title */}
          <div className="space-y-1">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 30))}
              placeholder="Title"
              className="text-base"
            />
            <p className="text-xs text-muted-foreground text-right">{title.length} / 30</p>
          </div>

          {/* Date / Time / Duration / Timezone */}
          <div className="grid grid-cols-[1fr_auto_auto_1.5fr] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Time</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Time" />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recurring event */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="recurring"
                checked={isRecurring}
                onCheckedChange={(c) => setIsRecurring(!!c)}
              />
              <Label htmlFor="recurring" className="cursor-pointer text-sm">Recurring event</Label>
            </div>

            {isRecurring && (
              <div className="space-y-3 pl-6 border-l-2 border-border">
                <div className="flex items-center gap-2 text-sm">
                  <span>Repeat every</span>
                  <Select value={repeatEvery} onValueChange={setRepeatEvery}>
                    <SelectTrigger className="w-16 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPEAT_INTERVALS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={repeatUnit} onValueChange={setRepeatUnit}>
                    <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPEAT_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-foreground">Repeat on</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEKDAYS.map((day) => (
                      <label
                        key={day}
                        className={`flex items-center gap-1.5 text-sm cursor-pointer`}
                      >
                        <Checkbox
                          checked={repeatDays.includes(day)}
                          onCheckedChange={() => toggleWeekday(day)}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-foreground">End</p>
                  <RadioGroup value={endType} onValueChange={(v) => setEndType(v as any)}>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="never" id="end-never" />
                      <Label htmlFor="end-never" className="text-sm cursor-pointer">Never</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="on" id="end-on" />
                      <Label htmlFor="end-on" className="text-sm cursor-pointer">On</Label>
                      {endType === "on" && (
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 h-8" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="after" id="end-after" />
                      <Label htmlFor="end-after" className="text-sm cursor-pointer">After</Label>
                      {endType === "after" && (
                        <>
                          <Input
                            type="number" min="1" max="100"
                            value={endAfter}
                            onChange={(e) => setEndAfter(e.target.value)}
                            className="w-16 h-8"
                          />
                          <span className="text-sm text-muted-foreground">occurrences</span>
                        </>
                      )}
                    </div>
                  </RadioGroup>
                </div>

                {repeatDays.length === 0 && (
                  <p className="text-sm text-destructive">Please select which day(s) your event will repeat on</p>
                )}
              </div>
            )}
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Location</Label>
            <Select value={locationType} onValueChange={setLocationType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_TYPES.map((lt) => (
                  <SelectItem key={lt.value} value={lt.value}>
                    <div className="flex items-center gap-2">
                      <lt.icon className="h-4 w-4" />
                      {lt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={locationValue}
              onChange={(e) => setLocationValue(e.target.value)}
              placeholder={locationPlaceholder}
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              rows={4}
              placeholder="Description"
            />
            <p className="text-xs text-muted-foreground text-right">{description.length} / 300</p>
          </div>

          {/* Cover image + Access side by side */}
          <div className="grid grid-cols-[1fr_1fr] gap-4">
            {/* Cover image */}
            <div>
              {coverImage ? (
                <div className="relative">
                  <img src={coverImage} alt="" className="w-full h-28 object-cover rounded-lg border border-border" />
                  <Button
                    variant="destructive" size="icon"
                    className="absolute top-1.5 right-1.5 h-6 w-6"
                    onClick={() => setCoverImage(null)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
                  <span className="text-sm text-primary font-medium">
                    {uploading ? "Uploading..." : "Upload cover image"}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">1460 x 752 px</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              )}
            </div>

            {/* Access */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Access</p>
              <RadioGroup value={accessRule} onValueChange={setAccessRule}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all_members" id="access-all" />
                  <Label htmlFor="access-all" className="text-sm cursor-pointer">All members</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="level" id="access-level" />
                  <Label htmlFor="access-level" className="text-sm cursor-pointer">Members on/above</Label>
                  {accessRule === "level" && (
                    <Select value={accessValue || "1"} onValueChange={setAccessValue}>
                      <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Level" /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8,9].map((l) => (
                          <SelectItem key={l} value={String(l)}>Level {l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {tiers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="tier" id="access-tier" />
                    <Label htmlFor="access-tier" className="text-sm cursor-pointer">Members on/above</Label>
                    {accessRule === "tier" && (
                      <Select value={accessValue} onValueChange={setAccessValue}>
                        <SelectTrigger className="w-32 h-7 text-xs"><SelectValue placeholder="Tier" /></SelectTrigger>
                        <SelectContent>
                          {tiers.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </RadioGroup>
            </div>
          </div>

          {/* Remind by email */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="remind-email"
              checked={remindEmail}
              onCheckedChange={(c) => setRemindEmail(!!c)}
            />
            <Label htmlFor="remind-email" className="text-sm cursor-pointer">Remind members by email 1 day before</Label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive mr-auto"
                onClick={() => {
                  if (confirm("Excluir este evento?")) deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              CANCEL
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!title.trim() || !date || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : isEditing ? "SAVE" : "ADD"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
