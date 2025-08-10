import React, { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export interface ProxyFormValues {
  domain: string;
  target_host: string;
  target_port: number; // stored as number after submit
  ssl_enabled: boolean;
  ssl_force_redirect: boolean;
}

interface ProxyFormProps {
  initialValues?: Partial<ProxyFormValues>;
  mode?: "create" | "edit";
  submitting?: boolean;
  onSubmit: (values: ProxyFormValues) => Promise<void> | void;
  onCancel: () => void;
  className?: string;
}

// Reusable form for creating or editing a proxy host
const ProxyForm: React.FC<ProxyFormProps> = ({
  initialValues,
  mode = "create",
  submitting = false,
  onSubmit,
  onCancel,
  className,
}) => {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProxyFormValues>({
    defaultValues: {
      domain: "",
      target_host: "",
      target_port: "" as unknown as number,
      ssl_enabled: false,
      ssl_force_redirect: false,
      ...initialValues,
    },
  });

  // Reset when initialValues change (e.g., switching between edit targets)
  useEffect(() => {
    if (initialValues) {
      reset({
        domain: initialValues.domain || "",
        target_host: initialValues.target_host || "",
        target_port:
          (initialValues.target_port as number) || ("" as unknown as number),
        ssl_enabled: !!initialValues.ssl_enabled,
        ssl_force_redirect: !!initialValues.ssl_force_redirect,
      });
    }
  }, [initialValues, reset]);

  const submitHandler = handleSubmit((data) => {
    const values: ProxyFormValues = {
      ...data,
      target_port: Number(data.target_port),
      ssl_enabled: !!data.ssl_enabled,
      ssl_force_redirect: !!data.ssl_force_redirect,
    };
    onSubmit(values);
  });

  return (
    <form onSubmit={submitHandler} className={className || "space-y-4"}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="domain">Domain Name</Label>
          <Input
            id="domain"
            placeholder="example.com"
            {...register("domain", {
              required: "Domain name is required",
              pattern: {
                value:
                  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
                message: "Invalid domain name format",
              },
            })}
          />
          {errors.domain && (
            <p className="text-sm text-destructive">{errors.domain.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="target_host">Target Host</Label>
          <Input
            id="target_host"
            placeholder="localhost or IP address"
            {...register("target_host", {
              required: "Target host is required",
            })}
          />
          {errors.target_host && (
            <p className="text-sm text-destructive">
              {errors.target_host.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="target_port">Target Port</Label>
          <Input
            id="target_port"
            type="number"
            placeholder="3000"
            {...register("target_port", {
              required: "Target port is required",
              min: { value: 1, message: "Port must be between 1 and 65535" },
              max: {
                value: 65535,
                message: "Port must be between 1 and 65535",
              },
            })}
          />
          {errors.target_port && (
            <p className="text-sm text-destructive">
              {errors.target_port.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Controller
            name="ssl_enabled"
            control={control}
            render={({ field }) => (
              <div className="flex items-center space-x-2 mt-6 md:mt-0">
                <Checkbox
                  id="ssl_enabled"
                  checked={!!field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                />
                <Label htmlFor="ssl_enabled">Enable SSL</Label>
              </div>
            )}
          />
        </div>

        <div className="space-y-2">
          <Controller
            name="ssl_force_redirect"
            control={control}
            render={({ field }) => (
              <div className="flex items-center space-x-2 mt-6 md:mt-0">
                <Checkbox
                  id="ssl_force_redirect"
                  checked={!!field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                />
                <Label htmlFor="ssl_force_redirect">Force HTTPS Redirect</Label>
              </div>
            )}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onCancel();
            reset();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting
            ? mode === "edit"
              ? "Updating..."
              : "Creating..."
            : mode === "edit"
            ? "Update Proxy"
            : "Create Proxy"}
        </Button>
      </div>
    </form>
  );
};

export default ProxyForm;
