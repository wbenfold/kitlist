
function run_kitlist (svg_selector, error_selector, config_files)
{
  function create_kitlist (error, data)
  {
    if (error)
    {
      d3.select(error_selector).text(error);
      console.log(error);
      return;
    }

    console.log('create_kitlist()');

    function includes (arr, thing)
    {
      return arr.indexOf(thing) != -1;
    }

    var all_tag_ids = [];
    var tag_data = [];
    var condition_tags = [];
    var kit_tags = [];

    var columns = [
      {
        width: 25,
        padding: 20,
        sections: [
        ]
      },
      {
        width: 15,
        padding: 20,
        sections: [
          {
            id: 'selected',
            title: 'You selected...',
            pattern: "g.tag[mode=selected]"
          },
          {
            id: 'implied',
            title: '...which suggests:',
            pattern: "g.tag[mode=implied]"
          },
        ]
      },
      {
        width: 40,
        padding: 20,
        sections: [
          {
            id: 'pack',
            title: 'Therefore you should pack:',
            pattern: "g.tag[mode=kitlist][type=personal],g.tag[mode=explicit]"
          },
          {
            id: 'group',
            title: 'Your group should have:',
            pattern: "g.tag[mode=kitlist][type=group]"
          },
          {
            id: 'bonus',
            title: 'And for bonus points, consider:',
            pattern: "g.tag[mode=kitlist][type=bonus],g.tag[mode=overkill]"
          }
        ]
      }
    ];

    var section_index = {};
    for (var i=0; i<data.categories.length; ++i)
    {
      var cat = data.categories[i];
      var pattern = 'g.tag[category="' + cat.id + '"]';
      pattern = pattern + '[mode=idle],' + pattern + '[mode=suggested]';

      if (!(cat.id in section_index))
      {
        section_index[cat.id] = columns[0].sections.length;
        columns[0].sections.push({
          id:     cat.id,
          title:  cat.name,
          pattern: pattern,
        });
      }

      for (var j=0; j<data.categories[i].tags.length; ++j)
      {
        var tag = data.categories[i].tags[j];
        if (includes(all_tag_ids, tag.id))
        {
          console.log("Duplicate tag: " + tag.id)
        }
        else
        {
          all_tag_ids.push(tag.id);
          tag.category = data.categories[i].id;
          tag_data.push(tag);
        }
      }
    }


    for (var i=0; i<data.rules.length; ++i)
    {
      var rule = data.rules[i];

      function collect_conditions (arr)
      {
        for (var j=0; j<arr.length; ++j)
        {
          var id = arr[j];
          if (!includes(all_tag_ids, id))
          {
            console.log("Undefined tag: " + id)
          }
          if (!includes(condition_tags, id))
          {
            condition_tags.push(id);
          }
        }
      }

      collect_conditions(rule.condition);
      if ('implies' in rule)
      {
        collect_conditions(rule.implies);
      }
      if ('suggests' in rule)
      {
        collect_conditions(rule.suggests);
      }
      if ('pack' in rule)
      {
        for (var j=0; j<rule.pack.length; ++j)
        {
          var id = rule.pack[j];
          if (!includes(all_tag_ids, id))
          {
            console.log("Undefined tag: " + id)
          }
          if (includes(condition_tags, id))
          {
            console.log("Tag used as both condition and kit: " + id)
          }
          if (!includes(kit_tags, id))
          {
            kit_tags.push(id);
          }
        }
      }
    }

    console.log('found ' + all_tag_ids.length + ' tags:');
    console.log('  ' + condition_tags.length + ' conditions');
    console.log('  ' + kit_tags.length + ' kit');
    console.log('  ' + (all_tag_ids.length - condition_tags.length - kit_tags.length) + ' unused');


    var get_id   = function(d) { return "tag_" + d.id; }
    var get_cat  = function(d) { return d.category;    }
    var get_type = function(d) { return ('type' in d) ? d.type : "personal"; }

    var selected  = [];
    var implied   = [];
    var suggested = [];
    var kitlist   = [];
    var overkill  = [];

    var all_tags = d3.select(svg_selector).append("g")
      .selectAll(".tag")
        .data(tag_data)
      .enter().append("g")
        .attr("class",    "tag")
        .attr("id",       get_id)
        .attr("mode",     "idle")
        .attr("category", get_cat)
        .attr("type",     get_type)
        .attr("transform", function(d, i) { return "translate(40," + (i * 40 + 40) + ")"; });


    all_tags.append("rect")
        .attr("id", get_id)
        .attr("rx", 10)
        .attr("ry", 10);


    var hpad = 10;
    var vpad = 5;

    all_tags.append("text")
        .attr("id", get_id)
        //.attr("dy", ".35em")
        .text(function(d) { return d.text; })
        .attr("x", hpad)
        .attr("y", function (d) { return vpad + this.getBBox().height;})
        .each(function(d) {
          bbox = this.getBBox();
          d3.selectAll("rect#" + get_id(d))
            .attr("x", bbox.x - hpad)
            .attr("y", bbox.y - vpad)
            .attr("width", bbox.width + 2*hpad)
            .attr("height", bbox.height + 2*vpad);
        });


    d3.selectAll("g.tag").on("click", function (d) {
      if (includes(selected, d.id))
      {
        selected.splice(selected.indexOf(d.id), 1)
      }
      else
      {
        selected.push(d.id)
      }
      save_to_url();
      load_from_url(500); //  may be a no-op
    });

    d3.select(window).on('resize', function() { update_layout(500); });

    function recompute ()
    {
      implied   = [];
      suggested = [];
      kitlist   = [];
      overkill  = [];

      function all_satisfied (conditions)
      {
        for (var i=0; i<conditions.length; ++i)
        {
          if (!includes(selected, conditions[i]) && !includes(implied, conditions[i]))
          {
            return false;
          }
        }
        return true;
      }

      //  Iteratively compute the implied set.  This could probably done in a
      //  single pass if the rules were topsorted, but we'd *so* mess that up.
      var changed = false;
      do
      {
        changed = false;
        for (var i=0; i<data.rules.length; ++i)
        {
          rule = data.rules[i];
          if (all_satisfied(rule.condition))
          {
            if ('implies' in rule)
            {
              for (var j=0; j<rule.implies.length; ++j)
              {
                var id = rule.implies[j];
                if (!includes(implied, id))
                {
                  implied.push(id);
                  //console.log("added '" + id + "' to implied");
                  changed = true;
                }
              }
            }
          }
        }
      }
      while (changed);

      //  Now that we've converged, populate the suggestions and kitlist
      for (var i=0; i<data.rules.length; ++i)
      {
        rule = data.rules[i];
        if (all_satisfied(rule.condition))
        {
          if ('suggests' in rule)
          {
            for (var j=0; j<rule.suggests.length; ++j)
            {
              var id = rule.suggests[j];
              if (!includes(suggested, id) && !includes(implied, id) && !includes(selected, id))
              {
                suggested.push(id);
              }
            }
          }

          if ('pack' in rule)
          {
            for (var j=0; j<rule.pack.length; ++j)
            {
              var id = rule.pack[j];
              if (!includes(kitlist, id))
              {
                kitlist.push(id);
              }
            }
          }
        }
      }

      //  Prune items according to substitutions
      for (var i=0; i<data.substitutions.length; ++i)
      {
        var replacement = data.substitutions[i][0];
        var replaced    = data.substitutions[i][1];

        //  Do we have the substituting item?
        if (!includes(kitlist, replacement) && !includes(selected, replacement))
        {
          continue;
        }

        for (var j=0; j<replaced.length; ++j)
        {
          //  Did the user explicitly select this item?
          if (includes(selected, replaced[j]))
          {
            continue;
          }

          //  Remove the substituted-for item if present
          var idx = kitlist.indexOf(replaced[j]);
          if (idx != -1)
          {
            kitlist.splice(idx, 1);
            overkill.push(replaced[j]);
          }
        }
      }

      function mode (record)
      {
        if (includes(selected, record.id))
        {
          if (includes(kit_tags, record.id))
          {
            return 'explicit'
          }
          else
          {
            return 'selected';
          }
        }
        if (includes(implied, record.id))
        {
          return 'implied';
        }
        if (includes(suggested, record.id))
        {
          return 'suggested';
        }
        if (includes(kitlist, record.id))
        {
          return 'kitlist';
        }
        if (includes(overkill, record.id))
        {
          return 'overkill';
        }
        return 'idle';
      }

      all_tags.attr('mode', mode);
    }

    function update_layout (delay)
    {
      w = d3.select(svg_selector).node().getBoundingClientRect().width;
      var ncols = columns.length;
      var pad = 0.05 * w;
      w -= (ncols - 1) * pad;
      var logical_w = 0;
      for (var i=0; i<columns.length; ++i)
      {
        logical_w += columns[i].width;
      }
      var scale = w / logical_w;
      var x = 0;

      var h = 0;

      for (var i=0; i<columns.length; ++i)
      {
        var width = scale * columns[i].width;
        var col = new Column({x: x, y: 0, width: width});
        for (var j=0; j<columns[i].sections.length; ++j)
        {
          col.arrange(columns[i].sections[j], columns[i].padding, delay);
        }
        x += width + pad;
        h = Math.max(h, col.height());
      }
      d3.select(svg_selector).style("height", h + "px");
    }

    function Column (rect)
    {
      this.rect = rect;
      this.lineH = 0;
      this.nextX = 0;
      this.nextY = 0;
      this.hpad = 2;
      this.vpad = 2;

      this.new_line = function ()
      {
        this.nextY += this.lineH + this.vpad;
        this.nextX = 0;
        this.lineH = 0;
      };

      this.height = function ()
      {
        return this.nextY;
      };

      this.arrange = function (group, padding, delay)
      {
        var things = d3.selectAll(group.pattern);
        var col = this;
        function add_to_layout ()
        {
          var bbox = this.getBBox();
          if (col.nextX + bbox.width > col.rect.width)
          {
            col.new_line();
          }
          var x = col.hpad + col.rect.x + col.nextX;
          var y = col.vpad + col.rect.y + col.nextY;
          col.nextX += bbox.width + col.hpad;
          col.lineH = Math.max(col.lineH, bbox.height);
          return "translate(" + x + "," + y +")";
        }

        d3.select(svg_selector).select("g").selectAll("g#" + group.id)
          .data([id]).enter()
            .append("g")
              .attr("class", "title")
              .attr("id", group.id)
              .append("text")
                .text(group.title)
                .attr("y", function () { return this.getBBox().height; });

        d3.select(svg_selector).select("g").selectAll("g#" + group.id)
          .transition()
          .duration(delay)
          .attr("opacity", things.size() ? 1 : 0.2)
          .attr("transform", add_to_layout);
        col.new_line();

        things
          .transition()
          .duration(delay)
          .attr("transform", add_to_layout)

        col.new_line();
        col.nextY += padding;
      };
    }


    //  ----  URL-handling stuff ----

    var prev_hash = null;

    function load_from_url (delay)
    {
      var hash = window.location.hash;
      if (prev_hash && (hash == prev_hash))
      {
        return;
      }
      prev_hash = hash;

      selected = [];
      if (hash)
      {
        hash = hash.replace("#", "");
        var parts = hash.split('&');
        for (var i=0; i<parts.length; ++i)
        {
          var kv = parts[i].split('=');
          if (kv[0] == "sel")
          {
            selected = kv[1].split(',');
            break;
          }

          console.log("Unknown key in hash: " + kv[0]);
        }
      }

      recompute();
      update_layout(delay);
    }

    function save_to_url ()
    {
      var parts = [];
      if (selected.length)
      {
        parts.push("sel=" + selected.join(','));
      }
      window.location.hash = "#" + parts.join('&');
      prev_hash = window.location.hash;
    }

    // initialize state for manual browsing actions
    window.addEventListener('popstate', function(event) {
      load_from_url(500);
    });

    //  No animation on initial load
    load_from_url(0);
  }



  var email = "mai_to:wi__@benfo_d.com?subject=Kitlist feedback".replace(/_/g, 'l');

  d3.select("span#feedback").html('<a href="#">[reset]</a> <a href="' + email + '">[feedback]</a>');




  function load_data (filenames, callback)
  {
    var combined = {
      depends:        [],
      categories:     [],
      rules:          [],
      substitutions:  []
    };

    var loaded = {};

    function helper (error, data)
    {
      if (error)
      {
        return callback(error);
      }

      function merge (attr)
      {
        if (attr in data)
        {
          for (var i=0; i<data[attr].length; ++i)
          {
            combined[attr].push(data[attr][i]);
          }
        }
      }
      merge('depends');
      merge('categories');
      merge('rules');
      merge('substitutions');

      while (combined.depends.length)
      {
        var next = combined.depends[combined.depends.length - 1];
        combined.depends.pop();
        if (!(next in loaded))
        {
          loaded[next] = true;
          console.log('Loading ' + next);
          return d3.json(next + '.json', helper);
        }
      }

      return callback(null, combined);
    }

    return helper (null, {depends: filenames});
  }

  if (!config_files)
  {
    var query = window.location.search.replace(/^\?/, '');
    config_files = query ? query.split(',') : ["oumc"];
    //  We process items from the back first, but humans think left-to-right
    config_files.reverse();
  }

  load_data(config_files, create_kitlist);
}
