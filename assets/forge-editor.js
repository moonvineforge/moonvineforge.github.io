(function () {
    "use strict";

    var STORAGE_KEY = "moonvine-forge-draft-v1";
    var RESTORE_MESSAGE = "Draft restored from this browser.";
    var TYPE_FIELD_LABELS = {
        card: "Card type",
        relic: "Relic type",
        enemy: "Enemy or action type",
        resource: "Resource type",
        status: "Status type",
        mechanic: "Mechanic scope"
    };

    function element(id) {
        return document.getElementById(id);
    }

    function clean(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function setText(target, value) {
        if (target) target.textContent = value;
    }

    function setHidden(target, hidden) {
        if (target) target.hidden = hidden;
    }

    function safeLoad(schema) {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return schema.normalizeSubmission(JSON.parse(raw));
        } catch (error) {
            window.localStorage.removeItem(STORAGE_KEY);
            return null;
        }
    }

    function safeSave(submission) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(submission));
            return true;
        } catch (error) {
            return false;
        }
    }

    function safeClear() {
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            return;
        }
    }

    function initializeEditor() {
        var root = document.querySelector("[data-forge-editor]");
        if (!root) return;

        var schema = window.MoonvineForgeSchema;
        var fatalStatus = element("forge-editor-fatal-status");
        if (!schema) {
            setText(fatalStatus, "The Forge editor could not load its data schema. Use the legacy form below.");
            setHidden(fatalStatus, false);
            return;
        }

        var form = element("forge-editor-form");
        var nameInput = element("forge-name");
        var rulesInput = element("forge-rules-text");
        var subtypeInput = element("forge-subtype");
        var costInput = element("forge-cost");
        var rarityInput = element("forge-rarity");
        var flavourInput = element("forge-flavour-text");
        var upgradeInput = element("forge-upgrade-text");
        var creditAliasInput = element("forge-credit-alias");
        var publicCreditInput = element("forge-public-credit");
        var subtypeLabel = element("forge-subtype-label");
        var detailsList = element("forge-detail-list");
        var detailLimitStatus = element("forge-detail-limit-status");
        var readiness = element("forge-readiness");
        var draftStatus = element("forge-draft-status");
        var restoreNotice = element("forge-restore-notice");
        var validationStatus = element("forge-validation-status");
        var validationMessage = element("forge-validation-message");
        var validationList = element("forge-validation-errors");
        var outputPanel = element("forge-local-output");
        var outputCode = element("forge-output-json");
        var clearButton = element("forge-clear-draft");
        var previewName = element("forge-preview-name");
        var previewCost = element("forge-preview-cost");
        var previewType = element("forge-preview-type");
        var previewRules = element("forge-preview-rules");
        var previewDetails = element("forge-preview-details");
        var rulesCounter = element("forge-rules-counter");
        var detailCounter = element("forge-detail-counter");
        var promptLink = document.querySelector(".prompt-submit-link");
        var promptText = element("prompt-text");

        var restored = safeLoad(schema);
        var state = restored || schema.createSubmission();

        function selectedContentType() {
            var checked = form.querySelector('input[name="forge-content-type"]:checked');
            return checked ? checked.value : "card";
        }

        function hydrateBaseFields() {
            var typeInput = form.querySelector(
                'input[name="forge-content-type"][value="' + state.contentType + '"]'
            );
            if (typeInput) typeInput.checked = true;
            nameInput.value = state.core.name;
            rulesInput.value = state.core.rulesText;
            subtypeInput.value = state.core.subtype;
            costInput.value = state.core.cost;
            rarityInput.value = state.core.rarity;
            flavourInput.value = state.core.flavourText;
            upgradeInput.value = state.core.upgradeText;
            creditAliasInput.value = state.credit.alias;
            publicCreditInput.checked = state.credit.publicCreditAllowed;
        }

        function updateBaseState() {
            state.contentType = selectedContentType();
            state.core.name = nameInput.value;
            state.core.rulesText = rulesInput.value;
            state.core.subtype = subtypeInput.value;
            state.core.cost = costInput.value;
            state.core.rarity = rarityInput.value;
            state.core.flavourText = flavourInput.value;
            state.core.upgradeText = upgradeInput.value;
            state.credit.alias = creditAliasInput.value;
            state.credit.publicCreditAllowed = Boolean(
                clean(creditAliasInput.value) && publicCreditInput.checked
            );
            if (!clean(creditAliasInput.value)) publicCreditInput.checked = false;
        }

        function contentTypeLabel() {
            var definition = schema.CONTENT_TYPES[state.contentType];
            return definition ? definition.label : schema.CONTENT_TYPES.card.label;
        }

        function placeholderName() {
            var definition = schema.CONTENT_TYPES[state.contentType];
            return definition ? definition.placeholderName : schema.CONTENT_TYPES.card.placeholderName;
        }

        function updateTypeSpecificLabels() {
            setText(subtypeLabel, TYPE_FIELD_LABELS[state.contentType] || "Type or category");
            nameInput.placeholder = placeholderName();
        }

        function createOption(value, label) {
            var option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            return option;
        }

        function renderDetails() {
            detailsList.replaceChildren();

            state.details.forEach(function (detail, index) {
                var article = document.createElement("article");
                article.className = "forge-detail-card";
                article.dataset.detailId = detail.id;

                var header = document.createElement("div");
                header.className = "forge-detail-card-header";

                var title = document.createElement("strong");
                title.textContent = "Detail " + String(index + 1).padStart(2, "0");

                var removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.className = "forge-text-button forge-detail-remove";
                removeButton.textContent = "Remove";
                removeButton.addEventListener("click", function () {
                    state.details = state.details.filter(function (candidate) {
                        return candidate.id !== detail.id;
                    });
                    persistAndRender();
                    renderDetails();
                });

                header.append(title, removeButton);

                var grid = document.createElement("div");
                grid.className = "forge-detail-grid";

                var kindField = document.createElement("label");
                kindField.className = "forge-field";
                var kindLabel = document.createElement("span");
                kindLabel.className = "forge-field-label";
                kindLabel.textContent = "Detail type";
                var kindSelect = document.createElement("select");
                kindSelect.className = "forge-input";
                Object.keys(schema.DETAIL_KINDS).forEach(function (kind) {
                    kindSelect.appendChild(createOption(kind, schema.DETAIL_KINDS[kind]));
                });
                kindSelect.value = detail.kind;
                kindField.append(kindLabel, kindSelect);

                var customField = document.createElement("label");
                customField.className = "forge-field";
                customField.hidden = detail.kind !== "custom";
                var customLabel = document.createElement("span");
                customLabel.className = "forge-field-label";
                customLabel.textContent = "Custom detail name";
                var customInput = document.createElement("input");
                customInput.className = "forge-input";
                customInput.type = "text";
                customInput.maxLength = schema.LIMITS.detailLabel;
                customInput.value = detail.label;
                customInput.placeholder = "For example: Timeline rewind rule";
                customField.append(customLabel, customInput);

                var textField = document.createElement("label");
                textField.className = "forge-field forge-field-wide";
                var textLabel = document.createElement("span");
                textLabel.className = "forge-field-label";
                textLabel.textContent = "Describe this detail";
                var textArea = document.createElement("textarea");
                textArea.className = "forge-input forge-detail-text";
                textArea.maxLength = schema.LIMITS.detailText;
                textArea.rows = 3;
                textArea.value = detail.text;
                textArea.placeholder = "Only add what makes the idea clearer.";
                textField.append(textLabel, textArea);

                kindSelect.addEventListener("change", function () {
                    detail.kind = kindSelect.value;
                    if (detail.kind !== "custom") detail.label = "";
                    customField.hidden = detail.kind !== "custom";
                    customInput.value = detail.label;
                    persistAndRender();
                });
                customInput.addEventListener("input", function () {
                    detail.label = customInput.value;
                    persistAndRender();
                });
                textArea.addEventListener("input", function () {
                    detail.text = textArea.value;
                    persistAndRender();
                });

                grid.append(kindField, customField, textField);
                article.append(header, grid);
                detailsList.appendChild(article);
            });

            setText(detailCounter, state.details.length + " / " + schema.LIMITS.detailCount + " details");
            setHidden(detailLimitStatus, state.details.length < schema.LIMITS.detailCount);
        }

        function addDetail(kind) {
            if (state.details.length >= schema.LIMITS.detailCount) {
                setText(detailLimitStatus, "The maximum of " + schema.LIMITS.detailCount + " detail blocks has been reached.");
                setHidden(detailLimitStatus, false);
                return;
            }
            state.details.push(schema.createDetail(kind));
            renderDetails();
            persistAndRender();
            var latest = detailsList.lastElementChild;
            if (latest) latest.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        function renderPreviewDetails() {
            previewDetails.replaceChildren();
            var meaningful = state.details.filter(function (detail) {
                return clean(detail.text);
            });

            if (!meaningful.length) {
                var empty = document.createElement("p");
                empty.className = "forge-preview-empty-detail";
                empty.textContent = "Optional triggers, targets, conditions, and edge cases will appear here.";
                previewDetails.appendChild(empty);
                return;
            }

            meaningful.slice(0, 6).forEach(function (detail) {
                var row = document.createElement("div");
                row.className = "forge-preview-detail";
                var label = document.createElement("span");
                label.textContent = detail.kind === "custom" && clean(detail.label)
                    ? clean(detail.label)
                    : schema.DETAIL_KINDS[detail.kind];
                var text = document.createElement("p");
                text.textContent = clean(detail.text);
                row.append(label, text);
                previewDetails.appendChild(row);
            });

            if (meaningful.length > 6) {
                var remainder = document.createElement("p");
                remainder.className = "forge-preview-remainder";
                remainder.textContent = "+ " + (meaningful.length - 6) + " more detail(s)";
                previewDetails.appendChild(remainder);
            }
        }

        function renderPreview() {
            var rules = clean(state.core.rulesText);
            var subtype = clean(state.core.subtype);
            setText(previewName, clean(state.core.name) || placeholderName());
            setText(previewCost, clean(state.core.cost) || "-");
            setText(previewType, subtype ? contentTypeLabel() + " / " + subtype : contentTypeLabel());
            setText(
                previewRules,
                rules || "Describe the behaviour of your idea and it will appear here immediately."
            );
            renderPreviewDetails();
            setText(rulesCounter, state.core.rulesText.length + " / " + schema.LIMITS.rulesTextMax);

            var ready = rules.length >= schema.LIMITS.rulesTextMin;
            readiness.classList.toggle("is-ready", ready);
            readiness.classList.toggle("is-waiting", !ready);
            setText(
                readiness,
                ready
                    ? "Ready to submit. Everything else is optional."
                    : "Describe what the mechanic does to make the idea ready."
            );
            updateTypeSpecificLabels();
        }

        function persistAndRender() {
            updateBaseState();
            var saved = safeSave(state);
            setText(
                draftStatus,
                saved ? "Draft saved in this browser." : "Draft could not be saved in this browser."
            );
            renderPreview();
            setHidden(outputPanel, true);
            validationStatus.classList.remove("is-success");
            setHidden(validationStatus, true);
        }

        function showValidation(errors) {
            validationList.replaceChildren();
            validationStatus.classList.remove("is-success");
            if (!errors.length) {
                setHidden(validationStatus, true);
                return;
            }

            errors.forEach(function (error) {
                var item = document.createElement("li");
                item.textContent = error.message;
                validationList.appendChild(item);
            });
            setText(validationMessage, "Please check the submission details below.");
            setHidden(validationStatus, false);
        }

        form.addEventListener("input", function (event) {
            if (event.target.closest(".forge-detail-card")) return;
            persistAndRender();
        });

        form.addEventListener("change", function (event) {
            if (event.target.closest(".forge-detail-card")) return;
            persistAndRender();
        });

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            updateBaseState();
            var prepared = schema.prepareSubmission(state);
            showValidation(prepared.errors);

            if (!prepared.valid) {
                setHidden(outputPanel, true);
                var firstError = validationList.firstElementChild;
                if (firstError) firstError.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }

            state = prepared.submission;
            safeSave(state);
            hydrateBaseFields();
            renderDetails();
            renderPreview();
            outputCode.textContent = JSON.stringify(state, null, 2);
            setHidden(outputPanel, false);
            setText(
                validationMessage,
                "Local preview created. This prototype has not sent anything to Moonvine Forge."
            );
            validationStatus.classList.add("is-success");
            setHidden(validationStatus, false);
            outputPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });

        clearButton.addEventListener("click", function () {
            var shouldClear = window.confirm("Discard the current local Forge draft?");
            if (!shouldClear) return;
            safeClear();
            state = schema.createSubmission();
            hydrateBaseFields();
            renderDetails();
            persistAndRender();
            setHidden(restoreNotice, true);
            showValidation([]);
        });

        root.querySelectorAll("[data-add-detail]").forEach(function (button) {
            button.addEventListener("click", function () {
                addDetail(button.dataset.addDetail);
            });
        });

        if (promptLink && promptText) {
            promptLink.addEventListener("click", function () {
                if (clean(rulesInput.value)) return;
                rulesInput.value = clean(promptText.textContent);
                persistAndRender();
            });
        }

  window.MoonvineForgeEditor = Object.freeze({
    prepareSubmission: function () {
      updateBaseState();
      return schema.prepareSubmission(state);
    },
    showValidation: function (errors) {
      showValidation(Array.isArray(errors) ? errors : []);
    },
    resetAfterSubmission: function () {
      safeClear();
      state = schema.createSubmission();
      form.reset();
      hydrateBaseFields();
      renderDetails();
      renderPreview();
      setHidden(restoreNotice, true);
      setHidden(outputPanel, true);
      showValidation([]);
      setText(draftStatus, "Drafts are saved only in this browser.");
    }
  });

  hydrateBaseFields();
  renderDetails();
  renderPreview();
  setHidden(restoreNotice, !restored);
        if (restored) setText(restoreNotice, RESTORE_MESSAGE);
        setText(draftStatus, restored ? RESTORE_MESSAGE : "Drafts are saved only in this browser.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeEditor, { once: true });
    } else {
        initializeEditor();
    }
})();
