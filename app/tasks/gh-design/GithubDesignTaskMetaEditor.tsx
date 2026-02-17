"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { zGithubDesignTaskMeta } from "./zGithubDesignTaskMeta";

type FormData = z.infer<typeof zGithubDesignTaskMeta>;

export function GithubDesignTaskMetaEditor() {
  return <GithubDesignTaskMetaEditorComponent />;
}
function GithubDesignTaskMetaEditorComponent() {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use tRPC useQuery hook
  const { data, isLoading, refetch } = trpc.getGithubDesignTaskMeta.useQuery({});
  const updateMutation = trpc.updateGithubDesignTaskMeta.useMutation();

  const form = useForm<FormData>({
    resolver: zodResolver(zGithubDesignTaskMeta),
  });

  const {
    fields: reviewerFields,
    append: appendReviewer,
    remove: removeReviewer,
  } = useFieldArray({
    control: form.control,
    name: "requestReviewers",
  });

  const {
    fields: repoFields,
    append: appendRepo,
    remove: removeRepo,
  } = useFieldArray({
    control: form.control,
    name: "repoUrls",
  });

  const [newReviewer, setNewReviewer] = useState("");
  const [newRepo, setNewRepo] = useState("");

  // Update form when data is loaded
  React.useEffect(() => {
    if (data?.meta) {
      const metaData = data.meta;
      form.reset({
        slackMessageTemplate:
          metaData.slackMessageTemplate ?? "🎨 *New Design {{ITEM_TYPE}}*: <{{URL}}|{{TITLE}}>",
        requestReviewers: (metaData.requestReviewers ?? []).map((reviewer: string) => ({
          value: reviewer,
        })),
        repoUrls: (metaData.repoUrls ?? []).map((repo: string) => ({ value: repo })),
      });
    }
  }, [data, form]);

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        slackMessageTemplate: data.slackMessageTemplate,
        requestReviewers: data.requestReviewers.map((r) => r.value),
        repoUrls: data.repoUrls.map((r) => r.value),
      };

      await updateMutation.mutateAsync(payload);

      toast.success("Configuration saved successfully");
      await refetch(); // Refresh the data
      // hide config
      setIsExpanded(false);
    } catch (error: unknown) {
      console.error("Failed to save metadata:", error);
      const errorMessage = (error as Error)?.message || "Failed to save configuration";
      toast.error(errorMessage);
    }
  };

  const addReviewer = () => {
    if (newReviewer.trim()) {
      appendReviewer({ value: newReviewer.trim() });
      setNewReviewer("");
    }
  };

  const addRepo = () => {
    if (newRepo.trim()) {
      appendRepo({ value: newRepo.trim() });
      setNewRepo("");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Loading configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Task Configuration
          <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? "Hide" : "Show"} Config
          </Button>
        </CardTitle>
        <CardDescription>Configure the GitHub Design Task automation settings</CardDescription>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Slack Message Template */}
            <div className="space-y-2">
              <Label htmlFor="slack-template">Slack Message Template</Label>
              <Textarea
                id="slack-template"
                {...form.register("slackMessageTemplate")}
                placeholder="🎨 *New Design {{ITEM_TYPE}}*: <{{URL}}|{{TITLE}}>"
                rows={3}
              />
              {form.formState.errors.slackMessageTemplate && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.slackMessageTemplate.message}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Use {`{{USERNAME}}`}, {`{{ITEM_TYPE}}`}, {`{{URL}}`}, and {`{{TITLE}}`} as
                placeholders
              </p>
            </div>

            {/* Request Reviewers */}
            <div className="space-y-2">
              <Label>Request Reviewers</Label>
              <div className="flex gap-2">
                <Input
                  value={newReviewer}
                  onChange={(e) => setNewReviewer(e.target.value)}
                  placeholder="GitHub username"
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addReviewer())}
                />
                <Button type="button" onClick={addReviewer} variant="outline">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {reviewerFields.map((field, index) => (
                  <Badge
                    key={field.id}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => removeReviewer(index)}
                  >
                    @{field.value} ×
                  </Badge>
                ))}
              </div>
              {form.formState.errors.requestReviewers && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.requestReviewers.message}
                </p>
              )}
            </div>

            {/* Repositories to Scan */}
            <div className="space-y-2">
              <Label>Repositories to Scan</Label>
              <div className="flex gap-2">
                <Input
                  value={newRepo}
                  onChange={(e) => setNewRepo(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addRepo())}
                />
                <Button type="button" onClick={addRepo} variant="outline">
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {repoFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between p-2 border rounded text-sm"
                  >
                    <span>{field.value}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeRepo(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              {form.formState.errors.repoUrls && (
                <p className="text-sm text-red-500">{form.formState.errors.repoUrls.message}</p>
              )}
            </div>

            {/* Save Button */}
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || updateMutation.isPending}
              className="w-full"
            >
              {form.formState.isSubmitting || updateMutation.isPending
                ? "Saving..."
                : "Save Configuration"}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
